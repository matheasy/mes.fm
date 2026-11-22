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

/* MES Polls owner page (mes.fm/polls-stats, behind the middleware.js password). Data = /api/polls-admin (every kept poll + reports),
 * /api/stats-series (page views of /polls) and polls.hivehub.dev (Hive polls made with mes.fm).
 * On 127.0.0.1 / localhost (no /api there) or with ?mock=1 the page uses MESPollStats.sample(). */
(function () {
	"use strict";
	var P = window.MESPollStats;
	var $ = function (id) { return document.getElementById(id); };
	var MOCK = /^(127\.0\.0\.1|localhost|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var DAY = 86400000;
	var KEY = "mes-polls-stats:v1";
	try { localStorage.setItem("mes-owner", "1"); } catch (e) {} // behind the password: /stats, /seo and /polls then show the owner links
	var S = { range: 30, q: "", st: "all", sort: "c", dir: "desc", showp: true, showv: true, showw: true };
	try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
	S.q = "";
	function save() { try { localStorage.setItem(KEY, JSON.stringify({ range: S.range, st: S.st, sort: S.sort, dir: S.dir, showp: S.showp, showv: S.showv, showw: S.showw })); } catch (e) {} }

	var DATA = null, VIEWS = {}, SHOWN = 120, OPEN = {};
	var NOW = Date.now();

	function esc(s) { return String(s === undefined || s === null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function num(n) { return Number(n || 0).toLocaleString("en-US"); }
	function pct(a, b) { return b ? Math.round(a / b * 100) + "%" : "0%"; }
	function when(ms) { if (!ms) return "—"; var d = new Date(ms); return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
	function ago(ms) {
		var s = Math.round((NOW - ms) / 1000), a = Math.abs(s), fut = s < 0, t;
		if (a < 90) t = "a minute"; else if (a < 5400) t = Math.round(a / 60) + " min"; else if (a < 129600) t = Math.round(a / 3600) + " h";
		else t = Math.round(a / 86400) + " days";
		return fut ? "in " + t : t + " ago";
	}

	/* ---------------- loading ---------------- */
	function load(quiet) {
		if (!quiet) $("ps-meta").textContent = "Loading…";
		NOW = Date.now();
		var pr = MOCK ? Promise.resolve({ now: NOW, polls: mockPolls() }) :
			fetch("/api/polls-admin", { cache: "no-store", credentials: "same-origin" }).then(function (r) {
				return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw new Error(j.error || ("HTTP " + r.status)); return j; });
			});
		return pr.then(function (d) {
			DATA = d; NOW = d.now || NOW;
			var note = (MOCK ? '<span class="ps-sample">Sample data</span> ' : "") + "<b>" + num(d.polls.length) + "</b> polls kept on mes.fm · loaded " + new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
			if (d.scanned !== null && d.scanned !== undefined) note += " · first look: indexed " + num(d.scanned) + " polls already on the server";
			if (d.gone) note += " · " + num(d.gone) + " expired polls left the index";
			$("ps-meta").innerHTML = note;
			renderAll();
			loadViews();
		}).catch(function (e) {
			$("ps-meta").innerHTML = '<b class="ps-bad">Could not load the polls</b> (' + esc(e.message) + ').' + (MOCK ? "" : ' <a href="?mock=1">See the page with sample data</a>');
		});
	}
	var MOCKP = null;
	function mockPolls() { if (!MOCKP) MOCKP = P.sample(Date.now()); return MOCKP; }

	function viewsRange() { return S.range <= 7 ? "7d" : S.range <= 30 ? "30d" : "365d"; }
	function loadViews() {
		var rg = viewsRange();
		if (VIEWS[rg]) { renderChart(); return; }
		var pr;
		if (MOCK) {
			var s = {}; for (var i = 0; i < 366; i++) s[P.dayKey(NOW - i * DAY)] = Math.round(20 + 18 * Math.sin(i / 4) + (i % 7) * 3);
			pr = Promise.resolve({ series: { "mes.fm|/polls": s } });
		} else pr = fetch("/api/stats-series?range=" + rg + "&pages=" + encodeURIComponent("mes.fm|/polls")).then(function (r) { return r.ok ? r.json() : { series: {} }; });
		pr.then(function (j) { VIEWS[rg] = j.series || {}; renderChart(); }).catch(function () { VIEWS[rg] = {}; renderChart(); });
	}

	/* ---------------- tiles ---------------- */
	function tile(label, value, sub, hero) {
		return '<div class="tu-stat' + (hero ? " tu-stat--hero" : "") + '"><span class="tu-stat__label">' + label + '</span><span class="tu-stat__value">' + value + "</span>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>";
	}
	function renderTiles(s) {
		var views = 0, vs = VIEWS["30d"] || VIEWS["365d"];
		if (vs) { var d30 = P.daily([], 30, NOW); views = P.viewsFor(d30, vs).reduce(function (a, b) { return a + b; }, 0); }
		$("ps-tiles").innerHTML = [
			tile("Polls kept", num(s.total), num(s.last7) + " in 7 days · " + num(s.last30) + " in 30", true),
			tile("Voters", num(s.votes), "avg " + s.avg.toFixed(1) + " per poll · " + num(s.picks) + " picks"),
			tile("Open now", num(s.open), num(s.closed) + " closed"),
			tile("No votes yet", num(s.noVotes), pct(s.noVotes, s.total) + " of polls"),
			tile("Reported", num(s.reported), num(s.hidden) + " hidden"),
			tile("/polls views, 30 days", vs ? num(views) : "…", "incl. opened poll links"),
			tile("Most votes", s.top ? num(s.top.v) : "—", s.top ? '<a href="/v/' + esc(s.top.id) + '" target="_blank" rel="noopener">' + esc(s.top.q.length > 46 ? s.top.q.slice(0, 44) + "…" : s.top.q) + "</a>" : "")
		].join("");
	}

	/* ---------------- question types ---------------- */
	function bars(rows, total) {
		return '<div class="ps-bars">' + rows.map(function (r) {
			return '<div class="ps-bar"><span class="ps-bl">' + r[0] + '</span><span class="ps-bt"><i style="width:' + (total ? Math.max(r[1] ? 1.5 : 0, r[1] / total * 100) : 0).toFixed(1) + '%"></i></span><span class="ps-bn">' + num(r[1]) + " <small>" + pct(r[1], total) + "</small></span></div>";
		}).join("") + "</div>";
	}
	function renderKinds(s) {
		var t = s.total;
		var opts = ["2", "3", "4", "5", "6", "7", "8+"].map(function (k) { return [k + " options", s.opts[k] || 0]; });
		var md = Object.keys(s.mdist).sort(function (a, b) { return a - b; }).map(function (k) { return ["up to " + k + " picks", s.mdist[k]]; });
		$("ps-kinds").innerHTML = "<h3>Picks per voter</h3>" + bars([["One pick (single choice)", s.single], ["Several picks", s.multi]].concat(md), t) +
			"<h3>Number of options</h3>" + bars(opts, t) + "<h3>Description</h3>" + bars([["With a description", s.desc], ["Question only", t - s.desc]], t);
	}
	function renderSets(s) {
		var t = s.total;
		$("ps-sets").innerHTML = "<h3>Who sees the results</h3>" + bars([["Always (live results)", s.sh.always], ["After voting", s.sh.voted], ["Only after it closes", s.sh.closed]], t) +
			"<h3>Closing</h3>" + bars([["Closes at a set time", s.close.date], ["Open until the maker closes it", s.close.manual], ["Closed early by the maker", s.close.early], ["Closed by the maker (no closing time)", s.close["manual-closed"]]], t) +
			"<h3>Changing a vote</h3>" + bars([["Voters may change their vote", s.change], ["One vote, final", t - s.change]], t);
	}

	/* ---------------- chart ---------------- */
	var CH = null;
	function renderChart() {
		if (!DATA) return;
		var days = P.daily(DATA.polls, S.range, NOW);
		var vs = VIEWS[viewsRange()], views = vs ? P.viewsFor(days, vs) : null;
		var box = $("ps-chart"), svg = $("ps-svg");
		var W = Math.max(280, box.clientWidth || 600), H = Math.max(200, Math.min(box.clientHeight || 280, 900));
		var full = box.closest(".mes-pfill");
		if (!full) H = W < 520 ? 220 : 280;
		var L = 34, R = 40, T = 12, B = 26, iw = W - L - R, ih = H - T - B, n = days.length, bw = iw / n;
		var maxP = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.polls; })));
		var maxR = Math.max(1, S.showv ? Math.max.apply(null, days.map(function (d) { return d.votes; })) : 0, S.showw && views ? Math.max.apply(null, views) : 0);
		function niceMax(m) { var p = Math.pow(10, Math.floor(Math.log10(m))), f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p; }
		maxP = Math.max(4, niceMax(maxP)); maxR = niceMax(maxR);
		var yP = function (v) { return T + ih - v / maxP * ih; }, yR = function (v) { return T + ih - v / maxR * ih; };
		var g = [];
		for (var k = 0; k <= 4; k++) {
			var y = T + ih * k / 4;
			g.push('<line class="ps-grid-l" x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>');
			if (S.showp) g.push('<text class="ps-ax" x="' + (L - 5) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + Math.round(maxP * (4 - k) / 4) + "</text>");
			if (S.showv || S.showw) g.push('<text class="ps-ax" x="' + (W - R + 5) + '" y="' + (y + 4).toFixed(1) + '">' + compact(maxR * (4 - k) / 4) + "</text>");
		}
		if (S.showp) days.forEach(function (d, i) {
			if (!d.polls) return;
			var x = L + i * bw + bw * 0.15, w = Math.max(1, bw * 0.7);
			g.push('<rect class="ps-barp" x="' + x.toFixed(1) + '" y="' + yP(d.polls).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + (T + ih - yP(d.polls)).toFixed(1) + '" rx="1.5"/>');
		});
		function line(vals, cls) {
			var pts = vals.map(function (v, i) { return (L + i * bw + bw / 2).toFixed(1) + "," + yR(v).toFixed(1); });
			return '<polyline class="' + cls + '" points="' + pts.join(" ") + '"/>';
		}
		if (S.showv) g.push(line(days.map(function (d) { return d.votes; }), "ps-linev"));
		if (S.showw && views) g.push(line(views, "ps-linew"));
		var step = Math.ceil(n / (W < 520 ? 4 : 8));
		days.forEach(function (d, i) {
			if ((i % step && i !== n - 1) || (i !== n - 1 && n - 1 - i < step * 0.6)) return;
			var dt = new Date(d.key + "T00:00:00Z");
			g.push('<text class="ps-ax" x="' + (L + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle">' + dt.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) + "</text>");
		});
		g.push('<line id="ps-hover" class="ps-hover" x1="0" x2="0" y1="' + T + '" y2="' + (T + ih) + '" visibility="hidden"/>');
		svg.setAttribute("viewBox", "0 0 " + W + " " + H);
		svg.setAttribute("width", W); svg.setAttribute("height", H);
		svg.innerHTML = g.join("");
		CH = { days: days, views: views, L: L, bw: bw, W: W };
		renderTiles(P.summary(DATA.polls, NOW));
	}
	function compact(v) { return v >= 10000 ? Math.round(v / 1000) + "k" : v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(Math.round(v)); }
	function hover(e) {
		if (!CH) return;
		var r = $("ps-svg").getBoundingClientRect(), x = (e.clientX - r.left) * (CH.W / r.width);
		var i = Math.floor((x - CH.L) / CH.bw);
		var tip = $("ps-tip"), hl = $("ps-hover");
		if (i < 0 || i >= CH.days.length) { tip.hidden = true; if (hl) hl.setAttribute("visibility", "hidden"); return; }
		var d = CH.days[i], cx = CH.L + i * CH.bw + CH.bw / 2;
		if (hl) { hl.setAttribute("x1", cx); hl.setAttribute("x2", cx); hl.setAttribute("visibility", "visible"); }
		tip.innerHTML = "<b>" + new Date(d.key + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }) + "</b><br>" +
			'<i class="ps-sw ps-sw--p"></i>' + num(d.polls) + " polls made<br>" + '<i class="ps-sw ps-sw--v"></i>' + num(d.votes) + " votes on them" +
			(CH.views ? '<br><i class="ps-sw ps-sw--w"></i>' + num(CH.views[i]) + " /polls views" : "");
		tip.hidden = false;
		var px = cx / CH.W * r.width;
		tip.style.left = Math.min(Math.max(4, px + 12), r.width - tip.offsetWidth - 4) + "px";
		tip.style.top = "8px";
	}

	/* ---------------- moderation ---------------- */
	var WHY = { spam: "spam", hate: "hate", sexual: "sexual", violence: "violence", personal: "personal info", other: "other" };
	function renderMod() {
		var list = DATA.polls.filter(function (p) { return p.r > 0 || p.hid; }).sort(function (a, b) { return (b.r - a.r) || (b.c - a.c); });
		$("ps-modcount").textContent = list.length ? "(" + list.length + ")" : "";
		if (!list.length) { $("ps-mod").innerHTML = '<li class="ps-empty">Nothing reported. 👍</li>'; return; }
		$("ps-mod").innerHTML = list.map(function (p) {
			var why = Object.keys(p.why || {}).map(function (k) { return esc(WHY[k] || k) + " ×" + p.why[k]; }).join(", ");
			return '<li class="ps-mi' + (p.hid ? " is-hidden" : "") + '" data-id="' + esc(p.id) + '"><div class="ps-mq"><a href="/v/' + esc(p.id) + '" target="_blank" rel="noopener">' + esc(p.q) + "</a>" +
				'<small>' + (p.hid ? '<b class="ps-bad">Hidden</b> · ' : "") + num(p.r) + " report" + (p.r === 1 ? "" : "s") + " from " + num(p.nets) + " network" + (p.nets === 1 ? "" : "s") + (why ? " · " + why : "") + " · made " + ago(p.c) + "</small>" +
				'<small class="ps-mo">' + p.o.map(esc).join(" · ") + (p.d ? "<br>" + esc(p.d) : "") + "</small></div>" +
				'<div class="ps-mb"><button type="button" class="tu-chip" data-do="ok">✓ Keep</button>' +
				(p.hid ? '<button type="button" class="tu-chip" data-do="unhide">Show</button>' : '<button type="button" class="tu-chip" data-do="hide">Hide</button>') +
				'<button type="button" class="tu-chip ps-del" data-do="del">Delete</button></div></li>';
		}).join("");
	}
	function mod(id, what, btn) {
		var p = DATA.polls.find(function (x) { return x.id === id; });
		if (what === "del" && !confirm("Delete this poll and all its votes for good?\n\n" + (p ? p.q : id))) return;
		if (btn) btn.disabled = true;
		var pr = MOCK ? Promise.resolve({ ok: true }) : fetch("/api/polls-admin", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ act: "mod", id: id, do: what }) })
			.then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || ("HTTP " + r.status)); return j; }); });
		pr.then(function () {
			if (p) {
				if (what === "del") DATA.polls = DATA.polls.filter(function (x) { return x !== p; });
				else if (what === "hide") p.hid = p.hid || Date.now();
				else { p.hid = 0; p.r = 0; p.nets = 0; p.why = {}; }
			}
			toast(what === "del" ? "Deleted." : what === "hide" ? "Hidden." : what === "ok" ? "Kept: reports cleared." : "Shown again.");
			renderAll();
		}).catch(function (e) { toast("Could not do that: " + e.message); if (btn) btn.disabled = false; });
	}
	function toast(t) {
		var el = $("ps-toast");
		if (!el) { el = document.createElement("div"); el.id = "ps-toast"; el.className = "ps-toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
		el.textContent = t; el.classList.add("is-on");
		clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("is-on"); }, 2600);
	}

	/* ---------------- list ---------------- */
	// Translate: hands the question, its options and description to /translate (it detects the language itself; target = this browser's language)
	function trLink(p) {
		var to = String(navigator.language || "en").split("-")[0].toLowerCase();
		var txt = [p.q].concat(p.o.map(function (o, i) { return (i + 1) + ". " + o; })).concat(p.d ? ["", p.d] : []).join("\n");
		return "/translate?from=auto&to=" + encodeURIComponent(to) + "&q=" + encodeURIComponent(txt.slice(0, 4800));
	}
	function rowHtml(p) {
		var st = P.status(p), lead = P.leader(p), id = esc(p.id);
		var out = '<tr class="ps-row' + (OPEN[p.id] ? " is-open" : "") + '" data-id="' + id + '" tabindex="0">' +
			'<td class="ps-td-q"><span class="ps-qt">' + esc(p.q) + "</span>" + (lead ? '<small>Leading: ' + lead.i.map(function (i) { return esc(p.o[i]); }).join(" / ") + " (" + Math.round(lead.share * 100) + "%)</small>" : "") + "</td>" +
			'<td class="ps-num" data-l="Options">' + p.o.length + '</td><td class="ps-num" data-l="Picks">' + (p.m > 1 ? "≤ " + p.m : "1") + '</td><td class="ps-num" data-l="Voters"><b>' + num(p.v) + "</b></td>" +
			'<td data-l="Made" title="' + esc(new Date(p.c).toLocaleString()) + '">' + when(p.c) + "</td>" +
			'<td data-l="Closes">' + (p.x ? "closed " + when(p.x) : p.cl ? (p.open ? ago(p.cl) : when(p.cl)) : '<span class="ps-mut">when closed</span>') + "</td>" +
			'<td data-l="Status"><span class="ps-st ps-st--' + st + '">' + st + "</span></td>" +
			'<td class="ps-num" data-l="Reports">' + (p.r ? '<b class="ps-bad">' + p.r + "</b>" : "0") + "</td></tr>";
		if (OPEN[p.id]) {
			var sum = (p.n || []).reduce(function (a, b) { return a + b; }, 0), max = Math.max.apply(null, (p.n || [0]).concat([1]));
			out += '<tr class="ps-detail"><td colspan="8">' + (p.d ? '<p class="ps-desc">' + esc(p.d) + "</p>" : "") +
				'<div class="ps-opts">' + p.o.map(function (o, i) {
					var v = (p.n || [])[i] || 0;
					return '<div class="ps-bar"><span class="ps-bl">' + esc(o) + '</span><span class="ps-bt"><i style="width:' + (v / max * 100).toFixed(1) + '%"></i></span><span class="ps-bn">' + num(v) + " <small>" + pct(v, sum) + "</small></span></div>";
				}).join("") + "</div>" +
				'<p class="ps-dmeta">Results shown: <b>' + esc({ always: "always", voted: "after voting", closed: "after it closes" }[p.sh] || p.sh) + "</b> · vote changes: <b>" + (p.ch ? "yes" : "no") + "</b> · id <code>" + id + "</code> · " +
				'<a href="/v/' + id + '" target="_blank" rel="noopener">Open the poll</a> · <a href="' + esc(trLink(p)) + '" target="_blank" rel="noopener" title="Open the question and options in MES Translate">🌐 Translate</a> · <button type="button" class="ps-link" data-copy="' + id + '">Copy link</button> · ' +
				(p.hid ? '<button type="button" class="ps-link" data-mod="unhide" data-id="' + id + '">Show again</button>' : '<button type="button" class="ps-link" data-mod="hide" data-id="' + id + '">Hide</button>') +
				' · <button type="button" class="ps-link ps-del" data-mod="del" data-id="' + id + '">Delete</button></p></td></tr>';
		}
		return out;
	}
	function renderList() {
		var list = P.sort(P.filter(DATA.polls, S.q, S.st), S.sort, S.dir);
		$("ps-lcount").textContent = "(" + num(list.length) + (list.length !== DATA.polls.length ? " of " + num(DATA.polls.length) : "") + ")";
		$("ps-tbody").innerHTML = list.length ? list.slice(0, SHOWN).map(rowHtml).join("") : '<tr><td colspan="8" class="ps-empty">No polls match.</td></tr>';
		$("ps-morewrap").hidden = list.length <= SHOWN;
		Array.prototype.forEach.call(document.querySelectorAll("#ps-table th"), function (th) {
			var on = th.getAttribute("data-k") === S.sort;
			th.setAttribute("aria-sort", on ? (S.dir === "asc" ? "ascending" : "descending") : "none");
			th.classList.toggle("is-sorted", on);
		});
		document.querySelectorAll("#ps-st .tu-chip").forEach(function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-s") === S.st)); });
	}

	/* ---------------- Hive ---------------- */
	var HIVE = "https://polls.hivehub.dev";
	function loadHive() {
		var pr;
		if (MOCK) pr = Promise.resolve(P.hiveRows([{ id: 1, author: "mes", permlink: "best-calculator-poll", question: "Which MES calculator should get an app next?", created: new Date(NOW - 6 * DAY).toISOString().slice(0, 19), end_time: new Date(NOW + 1 * DAY).toISOString().slice(0, 19), max_choices_voted: 1, allow_vote_changes: true }],
			[{ poll_id: 1 }, { poll_id: 1 }, { poll_id: 1 }]));
		else pr = fetch(HIVE + "/polls?select=id,author,permlink,question,created,end_time,max_choices_voted,ui_hide_res_until_voted,allow_vote_changes,platform&platform=ilike.*mes*&order=created.desc&limit=300")
			.then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
			.then(function (polls) {
				if (!polls.length) return [];
				return fetch(HIVE + "/poll_votes?select=poll_id&poll_id=in.(" + polls.map(function (p) { return p.id; }).join(",") + ")&limit=20000")
					.then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
					.then(function (v) { return P.hiveRows(polls, v); });
			});
		pr.then(function (rows) {
			$("ps-hcount").textContent = rows.length ? "(" + rows.length + ")" : "";
			if (!rows.length) { $("ps-hive").innerHTML = '<p class="ps-empty">No Hive polls made with mes.fm/polls yet.</p>'; return; }
			$("ps-hive").innerHTML = '<ul class="ps-hl">' + rows.map(function (r) {
				var href = "/polls?h=" + encodeURIComponent(r.author + "/" + r.permlink);
				return '<li><a href="' + href + '" target="_blank" rel="noopener">' + esc(r.q || r.permlink) + "</a><small>@" + esc(r.author) + " · " + num(r.votes) + " vote" + (r.votes === 1 ? "" : "s") + " · made " + when(r.c) +
					" · " + (r.end > NOW ? "closes " + ago(r.end) : "closed " + when(r.end)) + (r.m > 1 ? " · up to " + r.m + " picks" : "") + "</small></li>";
			}).join("") + "</ul>";
		}).catch(function (e) { $("ps-hive").innerHTML = '<p class="ps-bad">Could not reach polls.hivehub.dev (' + esc(e.message) + ").</p>"; });
	}

	function renderAll() {
		if (!DATA) return;
		var s = P.summary(DATA.polls, NOW);
		renderTiles(s); renderKinds(s); renderSets(s); renderMod(); renderList(); renderChart();
	}

	/* ---------------- wiring ---------------- */
	document.querySelectorAll("#ps-range .tu-chip").forEach(function (b) {
		b.setAttribute("aria-pressed", String(Number(b.getAttribute("data-r")) === S.range));
		b.addEventListener("click", function () {
			S.range = Number(b.getAttribute("data-r")); save();
			document.querySelectorAll("#ps-range .tu-chip").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
			renderChart(); loadViews();
		});
	});
	[["ps-showp", "showp"], ["ps-showv", "showv"], ["ps-showw", "showw"]].forEach(function (a) {
		var el = $(a[0]); el.checked = S[a[1]];
		el.addEventListener("change", function () { S[a[1]] = el.checked; save(); renderChart(); });
	});
	$("ps-svg").addEventListener("pointermove", hover);
	$("ps-svg").addEventListener("pointerleave", function () { $("ps-tip").hidden = true; var h = $("ps-hover"); if (h) h.setAttribute("visibility", "hidden"); });
	var rzT; window.addEventListener("resize", function () { clearTimeout(rzT); rzT = setTimeout(renderChart, 120); });
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rzT); rzT = setTimeout(renderChart, 80); }).observe($("ps-chart"));

	$("ps-q").addEventListener("input", function () { S.q = this.value; SHOWN = 120; renderList(); });
	$("ps-q").addEventListener("keydown", function (e) { if (e.key === "Escape") { this.value = ""; S.q = ""; renderList(); } });
	document.querySelectorAll("#ps-st .tu-chip").forEach(function (b) { b.addEventListener("click", function () { S.st = b.getAttribute("data-s"); SHOWN = 120; save(); renderList(); }); });
	document.querySelectorAll("#ps-table th").forEach(function (th) {
		th.tabIndex = 0;
		function go() { var k = th.getAttribute("data-k"); if (S.sort === k) S.dir = S.dir === "asc" ? "desc" : "asc"; else { S.sort = k; S.dir = k === "q" || k === "st" ? "asc" : "desc"; } save(); renderList(); }
		th.addEventListener("click", go);
		th.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
	});
	$("ps-more").addEventListener("click", function () { SHOWN += 200; renderList(); });
	$("ps-tbody").addEventListener("click", function (e) {
		var b = e.target.closest("[data-mod]");
		if (b) { mod(b.getAttribute("data-id"), b.getAttribute("data-mod"), b); return; }
		var c = e.target.closest("[data-copy]");
		if (c) { var u = "https://mes.fm/v/" + c.getAttribute("data-copy"); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast("Link copied: " + u); }, function () { prompt("Poll link", u); }); return; }
		if (e.target.closest("a")) return;
		var tr = e.target.closest("tr.ps-row");
		if (tr) { var id = tr.getAttribute("data-id"); OPEN[id] = !OPEN[id]; renderList(); }
	});
	$("ps-tbody").addEventListener("keydown", function (e) {
		var tr = e.target.closest && e.target.closest("tr.ps-row");
		if (tr && e.target === tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); var id = tr.getAttribute("data-id"); OPEN[id] = !OPEN[id]; renderList(); var again = document.querySelector('tr.ps-row[data-id="' + id + '"]'); if (again) again.focus(); }
	});
	$("ps-mod").addEventListener("click", function (e) {
		var b = e.target.closest("[data-do]"); if (!b) return;
		mod(b.closest("[data-id]").getAttribute("data-id"), b.getAttribute("data-do"), b);
	});
	$("ps-csv").addEventListener("click", function () {
		if (!DATA) return;
		var list = P.sort(P.filter(DATA.polls, S.q, S.st), S.sort, S.dir);
		var a = document.createElement("a");
		a.href = URL.createObjectURL(new Blob([P.csv(list)], { type: "text/csv" }));
		a.download = "mes-polls-" + P.dayKey(Date.now()) + ".csv";
		document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
	});
	$("ps-refresh").addEventListener("click", function () { VIEWS = {}; load(); loadHive(); });
	document.addEventListener("keydown", function (e) {
		if ((e.key === "r" || e.key === "R") && !e.ctrlKey && !e.metaKey && !e.altKey && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || "")) { VIEWS = {}; load(); loadHive(); }
	});
	(function panels() {
		if (!window.MESPanel) { setTimeout(panels, 60); return; }
		window.MESPanel.add($("ps-chartsec"), { bar: $("ps-cbtns"), onChange: function () { setTimeout(renderChart, 30); } });
		window.MESPanel.add($("ps-listsec"), { bar: $("ps-lbtns") });
	})();
	window.MESPollStatsDebug = { data: function () { return DATA; }, render: renderAll };

	load(); loadHive();
})();
