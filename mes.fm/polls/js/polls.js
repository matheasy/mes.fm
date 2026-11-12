/* MES Polls -- pure helpers for mes.fm/polls (global MESPoll; node: require). The server (mes.fm/api/poll.js) does its own checks. */
(function (root) {
	"use strict";
	var P = {};
	P.MAX_OPTIONS = 20; P.MAX_Q = 200; P.MAX_D = 600; P.MAX_O = 100;

	/** whole-number (or `dec` decimals) percentages that add up to exactly 100 (largest remainder); all zeros when nobody voted */
	P.percents = function (n, dec) {
		var k = Math.pow(10, dec || 0), tot = 0, i;
		for (i = 0; i < n.length; i++) tot += n[i];
		if (!tot) return n.map(function () { return 0; });
		var raw = n.map(function (x) { return x * 100 * k / tot; }), fl = raw.map(Math.floor), left = 100 * k - fl.reduce(function (a, b) { return a + b; }, 0);
		var order = raw.map(function (x, j) { return [x - fl[j], j]; }).sort(function (a, b) { return b[0] - a[0] || a[1] - b[1]; });
		for (i = 0; i < left; i++) fl[order[i][1]]++;
		return fl.map(function (x) { return Math.round(x) / k; });
	};
	/** indexes of the options with the most votes (none when nobody voted) */
	P.leaders = function (n) {
		var mx = Math.max.apply(null, n.concat([0]));
		if (!mx) return [];
		var out = []; n.forEach(function (x, i) { if (x === mx) out.push(i); }); return out;
	};
	function pl(x, w) { return x + " " + w + (x === 1 ? "" : "s"); }
	/** "2 days 3 hours", "1 hour 5 min", "4 min 10 s", "12 s" */
	P.left = function (ms) {
		var s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
		if (d) return pl(d, "day") + (h ? " " + pl(h, "hour") : "");
		if (h) return pl(h, "hour") + (m ? " " + m + " min" : "");
		if (m) return m + " min" + (sec && m < 10 ? " " + sec + " s" : "");
		return sec + " s";
	};
	P.UNITS = { min: 60000, hour: 3600000, day: 86400000, week: 604800000 };
	P.durMs = function (x, unit) { return Math.round(Number(x) * (P.UNITS[unit] || 0)); };
	/** a pasted list -> options (one per line, bullets / numbers dropped; a single line splits at commas) */
	P.optionsFromText = function (t) {
		var lines = String(t || "").split(/\r?\n/);
		if (lines.filter(function (l) { return l.trim(); }).length === 1 && /[,;]/.test(t)) lines = String(t).split(/[,;]/);
		return lines.map(function (l) { return l.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, "").replace(/\s+/g, " ").trim(); }).filter(Boolean).slice(0, P.MAX_OPTIONS);
	};
	/** a poll id out of a link or a bare id */
	P.idFromText = function (t) {
		var m = String(t || "").trim().match(/(?:\/v\/|[?&]p=)([a-z0-9]{8})(?![a-z0-9])/i) || String(t || "").trim().match(/^([a-z0-9]{8})$/i);
		return m ? m[1].toLowerCase() : null;
	};
	/** what is wrong with a draft, in plain words (empty = fine) */
	P.problems = function (d) {
		var out = [], q = String(d.q || "").trim(), seen = {}, o = (d.o || []).map(function (x) { return String(x || "").trim(); }).filter(Boolean);
		if (!q) out.push("Type a question.");
		if (q.length > P.MAX_Q) out.push("The question is too long (" + P.MAX_Q + " characters at most).");
		if (String(d.d || "").length > P.MAX_D) out.push("The description is too long.");
		if (o.length < 2) out.push("Add at least two options.");
		if (o.length > P.MAX_OPTIONS) out.push(P.MAX_OPTIONS + " options at most.");
		o.forEach(function (x) { var k = x.toLowerCase(); if (seen[k]) out.push("Two options are the same: " + x); seen[k] = 1; if (x.length > P.MAX_O) out.push("An option is too long: " + x.slice(0, 30) + "…"); });
		if (d.cl && d.cl < Date.now() + 60000) out.push("The closing time has to be at least a minute from now.");
		if (d.cl && d.cl > Date.now() + 366 * 86400000) out.push("A poll can be open for a year at most.");
		return out;
	};
	/** donut slices for counts: [{i, a0, a1}] in radians from the top, clockwise */
	P.slices = function (n) {
		var tot = n.reduce(function (a, b) { return a + b; }, 0), a = 0, out = [];
		if (!tot) return out;
		n.forEach(function (x, i) { if (!x) return; var a1 = a + x / tot * Math.PI * 2; out.push({ i: i, a0: a, a1: a1 }); a = a1; });
		return out;
	};

	/* ---------- Hive polls: PeakD's Hive Open Polls protocol (as PeakD / Ecency / HiveHub write and read it, checked on chain 2026-10-31) ----------
	 * A poll = a root post whose json_metadata has content_type "poll" (PeakD writes version 0.8, Ecency 1.1): question, choices, end_time (unix s),
	 * preferred_interpretation, token, filters {account_age: days}, max_choices_voted, allow_vote_changes, ui_hide_res_until_voted.
	 * A vote = custom_json id "polls", posting auth, json {"poll":"author/permlink","action":"vote","choices":[1-based numbers]}; choices [] removes the
	 * vote. The original 0.1 spec form {"poll": <trx id of the post>, "choice": n} is read too. */
	var H = P.hive = {};
	H.VERSION = 0.8; H.MAX_DAYS = 30; H.MIN_MS = 10 * 60000;
	function utc(s) { if (typeof s === "number") return s; var t = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(s) ? s : s + "Z"); return isNaN(t) ? 0 : t; }
	H.utc = utc;
	/** a post (condenser or bridge shape) -> normalised poll, or null when it is not a poll */
	H.parse = function (post) {
		if (!post || !post.author) return null;
		var m = post.json_metadata; if (typeof m === "string") { try { m = JSON.parse(m); } catch (e) { m = null; } }
		if (!m || m.content_type !== "poll" || !Array.isArray(m.choices) || m.choices.length < 2) return null;
		var f = m.filters, age = 0;
		if (Array.isArray(f)) f.forEach(function (x) { if (x && x.account_age != null) age = +x.account_age || 0; });
		else if (f && typeof f === "object") age = +f.account_age || 0;
		var mx = parseInt(m.max_choices_voted, 10);
		return {
			author: post.author, permlink: post.permlink, title: post.title || "", body: post.body || "", category: post.category || post.parent_permlink || "",
			question: String(m.question || post.title || ""), description: typeof m.description === "string" ? m.description : "",
			choices: m.choices.map(function (c) { return String(c); }), end: (+m.end_time || 0) * 1000, created: utc(post.created || 0),
			max: mx > 1 ? Math.min(mx, m.choices.length) : 1, changes: m.allow_vote_changes !== false, ageDays: Math.max(0, age),
			hide: !!m.ui_hide_res_until_voted, interp: m.preferred_interpretation || "number_of_votes", token: m.token || "", version: m.version, app: m.app || ""
		};
	};
	/** one custom_json op {json, t (ISO or ms), auths:[account] | required_posting_auths} -> {a, choices, t} for this poll, or null */
	H.parseVote = function (op, poll, trx) {
		if (!op) return null;
		var j = op.json; if (typeof j === "string") { try { j = JSON.parse(j); } catch (e) { return null; } }
		if (!j || typeof j !== "object" || (j.action && j.action !== "vote")) return null;
		var ref = poll.author + "/" + poll.permlink;
		if (j.poll !== ref && !(trx && j.poll === trx)) return null;
		var auths = op.auths || op.required_posting_auths || [];
		var a = auths[0]; if (!a) return null;
		var ch;
		if (Array.isArray(j.choices)) ch = j.choices; else if (j.choice != null) ch = +j.choice === 0 ? [] : [j.choice]; else return null;
		return { a: String(a), choices: ch, t: utc(op.t || op.timestamp || 0) };
	};
	function okChoices(ch, poll) {
		if (!Array.isArray(ch) || ch.length > poll.max) return null;
		var seen = {}, out = [];
		for (var i = 0; i < ch.length; i++) { var c = ch[i]; if (typeof c !== "number" || c % 1 || c < 1 || c > poll.choices.length || seen[c]) return null; seen[c] = 1; out.push(c); }
		return out.sort(function (x, y) { return x - y; });
	}
	/** count votes [{a, choices, t}] the way the protocol says: only votes between the post and end_time, valid choices only, the latest vote per
	 *  account wins (the first one when allow_vote_changes is false), [] = no vote, account_age filter at the time of the vote (created = {account: ISO}).
	 *  -> {n: votes per choice (0-based), v: accounts counted, voters: [{a, choices (1-based), t}], skipped: [{a, why}]} */
	H.count = function (poll, votes, created) {
		var by = {}, skipped = [], i;
		(votes || []).slice().sort(function (x, y) { return x.t - y.t; }).forEach(function (v) {
			if (poll.created && v.t < poll.created) return;
			if (poll.end && v.t > poll.end) { if (!by[v.a]) skipped.push({ a: v.a, why: "voted after the poll ended" }); return; }
			var ch = okChoices(v.choices, poll); if (!ch) return;
			if (!poll.changes && by[v.a]) return;
			by[v.a] = { a: v.a, choices: ch, t: v.t };
		});
		var n = poll.choices.map(function () { return 0; }), voters = [];
		Object.keys(by).forEach(function (a) {
			var v = by[a]; if (!v.choices.length) return;
			if (poll.ageDays > 0) {
				var c = created && created[a] ? utc(created[a]) : 0;
				if (!c) { skipped.push({ a: a, why: "account age unknown" }); return; }
				if (v.t - c < poll.ageDays * 86400000) { skipped.push({ a: a, why: "account younger than " + poll.ageDays + " days" }); return; }
			}
			v.choices.forEach(function (c) { n[c - 1]++; });
			voters.push(v);
		});
		voters.sort(function (x, y) { return y.t - x.t; });
		return { n: n, v: voters.length, voters: voters, skipped: skipped };
	};
	/** the custom_json payload of a vote, exactly as PeakD writes it */
	H.voteJson = function (poll, choices) { return JSON.stringify({ poll: poll.author + "/" + poll.permlink, action: "vote", choices: choices.slice().sort(function (x, y) { return x - y; }) }); };
	/** "author/permlink", "@author/permlink", or a peakd / hive.blog / ecency / hivehub link -> {author, permlink} */
	H.ref = function (t) {
		var m = String(t || "").trim().match(/@?([a-z0-9][a-z0-9.-]{1,15})\/([a-z0-9][a-z0-9-]{0,255})\/?(?:[?#].*)?$/i);
		if (!m) return null;
		var a = m[1].toLowerCase(), p = m[2].toLowerCase();
		if (!/^[a-z][a-z0-9-.]{2,15}$/.test(a)) return null;
		return { author: a, permlink: p };
	};
	H.tags = function (t) {
		var out = [];
		String(t || "").toLowerCase().split(/[\s,#]+/).forEach(function (x) { x = x.replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, ""); if (x && x.length <= 24 && out.indexOf(x) < 0) out.push(x); });
		return out.slice(0, 10);
	};
	H.permlink = function (title, now) {
		var s = String(title || "poll").toLowerCase().normalize ? String(title || "poll").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") : String(title || "poll").toLowerCase();
		s = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "") || "poll";
		return s + "-" + Math.floor((now || Date.now()) / 1000).toString(36);
	};
	H.defaultBody = function (o) {
		var lines = [];
		if (o.description) lines.push(o.description, "");
		lines.push("**" + o.question + "**", "");
		o.choices.forEach(function (c, i) { lines.push((i + 1) + ". " + c); });
		lines.push("");
		if (o.endMs) lines.push("Voting ends " + new Date(o.endMs).toUTCString().replace(/:\d\d GMT$/, " UTC") + ".", "");
		if (o.link) lines.push("Vote on PeakD or Ecency, or on mes.fm with Hive Keychain: " + o.link);
		return lines.join("\n").trim();
	};
	/** what is wrong with a Hive poll draft (empty = fine) */
	H.problems = function (o, now) {
		now = now || Date.now();
		var out = P.problems({ q: o.question, d: "", o: o.choices });
		if (!String(o.title || "").trim()) out.push("Type a post title.");
		if (String(o.title || "").length > 255) out.push("The post title is too long (255 characters at most).");
		if (!String(o.body || "").trim()) out.push("Write the post text.");
		if (!o.endMs || isNaN(o.endMs)) out.push("Hive polls need an end time.");
		else if (o.endMs < now + H.MIN_MS) out.push("The end time has to be at least 10 minutes from now.");
		else if (o.endMs > now + H.MAX_DAYS * 86400000) out.push("A Hive poll can run for " + H.MAX_DAYS + " days at most.");
		if (!(o.tags || []).length && !o.community) out.push("Add at least one tag or a community.");
		if (o.community && !/^hive-\d{4,7}$/.test(o.community)) out.push("A community id looks like hive-123456.");
		return out;
	};
	/** the post to broadcast: {parentPermlink, permlink, title, body, meta (string)} */
	H.buildPost = function (o, now) {
		var tags = (o.tags || []).slice(), choices = o.choices.map(function (c) { return String(c).trim(); }).filter(Boolean);
		var meta = { app: "mes.fm/polls", format: "markdown", content_type: "poll", version: H.VERSION, question: String(o.question).trim(), choices: choices,
			preferred_interpretation: "number_of_votes", end_time: Math.floor(o.endMs / 1000), filters: { account_age: Math.max(0, Math.round(o.ageDays || 0)) },
			allow_vote_changes: !!o.changes, ui_hide_res_until_voted: !!o.hide, community_membership: [] };
		if (o.max > 1) meta.max_choices_voted = Math.min(o.max, choices.length);
		if (o.description) meta.description = String(o.description).slice(0, 300);
		meta.tags = tags;
		return { parentPermlink: o.community || tags[0], permlink: o.permlink || H.permlink(o.title, now), title: String(o.title).trim(), body: String(o.body).trim(), meta: JSON.stringify(meta) };
	};
	if (typeof module !== "undefined" && module.exports) module.exports = P; else root.MESPoll = P;
})(this);

/* MES Polls -- mes.fm/polls (UI; helpers in lib.js = MESPoll; server = mes.fm/api/poll.js).
 * A poll is opened with /polls?p=<id> (the public short address mes.fm/v/<id> is a vercel.json rewrite to it); a manager link adds #k=<key>.
 * localStorage "mes-polls:v1" = { vid: random browser id, mine: [{id, key, q, c}], voted: {id: [picks]} }; the maker's draft is "mes-polls:draft".
 * On localhost / 127.0.0.1 (no /api) or with ?mock=1 the page talks to an in-browser stand-in kept in localStorage "mes-polls:mock".
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("pl"), P = window.MESPoll;
	if (!root || !P) return;
	var KEY = "mes-polls:v1", DKEY = "mes-polls:draft", T0 = Date.now();
	var MOCK = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]mock=1/.test(location.search);
	var NCOL = 10, HP = P.hive;

	function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
	function toast(msg) { var t = $("pl-toast"); if (!t) { t = el("div", "tu-toast"); t.id = "pl-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2600); }
	function copy(text, done) {
		function fb() { var ta = el("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(done || "Copied"); } catch (e) { toast("Could not copy: select the text and copy it yourself"); } ta.remove(); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(done || "Copied"); }, fb); else fb();
	}

	/* ---------- saved state ---------- */
	var S = { vid: "", mine: [], voted: {}, hide: {} };
	function rnd() { var a = new Uint8Array(16); (window.crypto || window.msCrypto).getRandomValues(a); return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
	function load() {
		try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) { if (/^[a-f0-9]{32}$/.test(s.vid)) S.vid = s.vid; if (Array.isArray(s.mine)) S.mine = s.mine.filter(function (m) { return m && (/^[a-z0-9]{8}$/.test(m.id) || (m.hive && P.hive.ref(m.hive))); }).slice(0, 100); if (s.voted && typeof s.voted === "object") S.voted = s.voted; if (s.hide && typeof s.hide === "object") S.hide = s.hide; } } catch (e) {}
		if (!S.vid) S.vid = rnd();
	}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	load(); save();
	window.addEventListener("storage", function (e) { if (e.key === KEY) { load(); renderMine(); } });
	function mineOf(id) { for (var i = 0; i < S.mine.length; i++) if (S.mine[i].id === id) return S.mine[i]; return null; }

	/* ---------- server (or the local stand-in) ---------- */
	function api(method, body, id) {
		if (MOCK) return Promise.resolve(mockApi(method, body, id));
		var o = method === "GET" ? { cache: "no-store" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
		return fetch("/api/poll" + (method === "GET" ? "?id=" + encodeURIComponent(id) : ""), o).then(function (r) {
			return r.json().catch(function () { return {}; }).then(function (j) { j._code = r.status; return j; });
		}, function () { return { _code: 0, error: "Could not reach mes.fm. Check your connection." }; });
	}
	function mockApi(method, b, id) {
		var db; try { db = JSON.parse(localStorage.getItem("mes-polls:mock") || "{}"); } catch (e) { db = {}; }
		var now = Date.now(), put = function () { localStorage.setItem("mes-polls:mock", JSON.stringify(db)); };
		function pub(x, show) { var p = x.p, open = !p.x && now < (p.cl || p.c + 366 * 864e5); var o = { id: x.id, q: p.q, d: p.d, o: p.o, m: p.m, cl: p.cl, sh: p.sh, ch: p.ch, c: p.c, x: p.x, open: open, closes: p.x || p.cl || p.c + 366 * 864e5, now: now, v: x.v }; if (show || p.sh === "always" || !open) o.n = x.n.slice(); return o; }
		if (method === "GET") { var g = db[id]; if (g && g.hid) return { _code: 410, error: "this poll was hidden after reports", hidden: true }; return g ? Object.assign({ _code: 200 }, pub(g)) : { _code: 404, error: "poll not found" }; }
		if (b.act === "new") {
			var probs = P.problems({ q: b.q, o: b.o, cl: b.cl }); if (probs.length) return { _code: 400, error: probs[0] };
			var nid = rnd().replace(/[^a-z0-9]/g, "").slice(0, 8), key = rnd();
			db[nid] = { id: nid, k: key, p: { q: b.q.trim(), d: b.d || "", o: b.o, m: b.m, cl: b.cl, sh: b.sh, ch: b.ch, c: now, x: 0 }, n: b.o.map(function () { return 0; }), v: 0, b: {} }; put();
			return { _code: 200, id: nid, key: key };
		}
		var x = db[b.id]; if (!x) return { _code: 404, error: "poll not found" };
		var open = !x.p.x && now < (x.p.cl || x.p.c + 366 * 864e5);
		if (b.act === "vote") {
			if (!open) return { _code: 409, error: "this poll is closed", poll: pub(x) };
			var prev = x.b[b.vid];
			if (prev && !x.p.ch) return { _code: 409, error: "you already voted in this poll", mine: prev, poll: pub(x, x.p.sh === "voted") };
			if (prev) prev.forEach(function (i) { x.n[i]--; }); else x.v++;
			b.picks.forEach(function (i) { x.n[i]++; }); x.b[b.vid] = b.picks.slice().sort(); put();
			return { _code: 200, ok: true, mine: x.b[b.vid], changed: !!prev, poll: pub(x, x.p.sh !== "closed") };
		}
		if (b.act === "report") { x.r = x.r || {}; var again = !!x.r[b.vid]; x.r[b.vid] = b.r; if (Object.keys(x.r).length >= 3) x.hid = now; put(); return { _code: 200, ok: true, again: again, hidden: !!x.hid }; }
		var owner = b.key === x.k;
		if (b.act === "peek") { var mine = x.b[b.vid] || null; return { _code: 200, poll: pub(x, owner || (mine && x.p.sh === "voted")), mine: mine, owner: owner }; }
		if (!owner) return { _code: 403, error: "only the person who made this poll can do that" };
		if (b.act === "close") { x.p.x = now; put(); return { _code: 200, ok: true, poll: pub(x, true) }; }
		if (b.act === "del") { delete db[b.id]; put(); return { _code: 200, ok: true }; }
		return { _code: 400, error: "unknown action" };
	}
	function shareUrl(id) { return MOCK ? location.origin + "/polls?p=" + id : "https://mes.fm/v/" + id; }
	function hiveUrl(r) { return MOCK ? location.origin + "/polls?h=" + r.author + "/" + r.permlink : "https://mes.fm/hp/" + r.author + "/" + r.permlink; }
	function hivePath(r) { return MOCK ? "/polls?h=" + r.author + "/" + r.permlink : "/hp/" + r.author + "/" + r.permlink; }
	function curLink() { return V.hive ? hiveUrl(V.hive) : shareUrl(V.id); }

	/* ---------- drawing a poll (used by the poll view and the preview) ---------- */
	function donut(n, tot, word) {
		var NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
		svg.setAttribute("viewBox", "0 0 120 120"); svg.setAttribute("class", "pl-donut"); svg.setAttribute("role", "img");
		svg.setAttribute("aria-label", "Pie chart of the votes");
		var bg = document.createElementNS(NS, "circle"); bg.setAttribute("cx", 60); bg.setAttribute("cy", 60); bg.setAttribute("r", 46); bg.setAttribute("class", "pl-donut-bg"); svg.appendChild(bg);
		P.slices(n).forEach(function (s) {
			var path = document.createElementNS(NS, "path"), r = 46, a0 = s.a0, a1 = s.a1;
			if (a1 - a0 >= Math.PI * 2 - 1e-6) { var full = document.createElementNS(NS, "circle"); full.setAttribute("cx", 60); full.setAttribute("cy", 60); full.setAttribute("r", r); full.setAttribute("class", "pl-donut-full pl-s" + (s.i % NCOL)); svg.appendChild(full); return; }
			var x0 = 60 + r * Math.sin(a0), y0 = 60 - r * Math.cos(a0), x1 = 60 + r * Math.sin(a1), y1 = 60 - r * Math.cos(a1);
			path.setAttribute("d", "M" + x0.toFixed(2) + " " + y0.toFixed(2) + "A" + r + " " + r + " 0 " + (a1 - a0 > Math.PI ? 1 : 0) + " 1 " + x1.toFixed(2) + " " + y1.toFixed(2));
			path.setAttribute("class", "pl-slice pl-s" + (s.i % NCOL));
			svg.appendChild(path);
		});
		var c1 = document.createElementNS(NS, "text"); c1.setAttribute("x", 60); c1.setAttribute("y", 60); c1.setAttribute("class", "pl-donut-n"); c1.textContent = String(tot);
		var c2 = document.createElementNS(NS, "text"); c2.setAttribute("x", 60); c2.setAttribute("y", 76); c2.setAttribute("class", "pl-donut-l"); c2.textContent = (word || "vote") + (tot === 1 ? "" : "s");
		svg.appendChild(c1); svg.appendChild(c2);
		return svg;
	}
	function results(poll, mine) {
		var box = el("div", "pl-res"), n = poll.n, tot = n.reduce(function (a, b) { return a + b; }, 0), pc = P.percents(n, 0), lead = P.leaders(n);
		var bars = el("ol", "pl-bars");
		var order = n.map(function (_, i) { return i; });
		order.forEach(function (i) {
			var li = el("li", "pl-brow" + (lead.indexOf(i) >= 0 ? " pl-lead" : "") + (mine && mine.indexOf(i) >= 0 ? " pl-minepick" : ""));
			var top = el("div", "pl-btop");
			var lab = el("span", "pl-blab"); var sw = el("span", "pl-sw pl-b" + (i % NCOL)); sw.setAttribute("aria-hidden", "true"); lab.appendChild(sw); lab.appendChild(document.createTextNode(poll.o[i]));
			if (mine && mine.indexOf(i) >= 0) lab.appendChild(el("span", "pl-you", "your vote"));
			var num = el("span", "pl-bnum"); num.appendChild(el("strong", null, pc[i] + "%")); num.appendChild(document.createTextNode(" · " + n[i]));
			top.appendChild(lab); top.appendChild(num);
			var track = el("div", "pl-track"), fill = el("div", "pl-fill pl-b" + (i % NCOL)); fill.style.width = (tot ? n[i] / Math.max.apply(null, n) * 100 : 0) + "%";
			track.appendChild(fill);
			li.appendChild(top); li.appendChild(track);
			li.setAttribute("aria-label", poll.o[i] + ": " + n[i] + " (" + pc[i] + "%)" + (lead.indexOf(i) >= 0 ? ", most votes" : ""));
			bars.appendChild(li);
		});
		box.appendChild(bars);
		var side = el("div", "pl-side"); side.appendChild(donut(n, tot, poll.m > 1 ? "pick" : "vote"));
		box.appendChild(side);
		var t = el("p", "pl-tot");
		var v = poll.v || 0;
		t.textContent = poll.m > 1 ? v + (v === 1 ? " person" : " people") + " voted · " + tot + (tot === 1 ? " pick" : " picks") : v + (v === 1 ? " person" : " people") + " voted";
		if (lead.length && tot) t.textContent += lead.length > 1 ? " · tie for first" : " · leading: " + poll.o[lead[0]];
		box.appendChild(t);
		return box;
	}
	function hiddenNote(poll, mine) {
		if (poll.sh === "voted" && !mine) return "Vote to see the results.";
		if (poll.sh === "closed") return "The results are shown when voting ends." + (poll.v ? " " + poll.v + (poll.v === 1 ? " person has" : " people have") + " voted so far." : "");
		return "";
	}
	/** draw into box: o = {mine, mode: "vote"|"res", preview, onVote(picks), busy} */
	function drawPoll(box, poll, o) {
		box.textContent = "";
		var h = el(o.preview ? "h3" : "h2", "pl-q", poll.q || "Your question"); if (!o.preview) h.id = "pl-q"; if (!poll.q) h.classList.add("pl-ph");
		box.appendChild(h);
		if (poll.d) box.appendChild(el("p", "pl-d", poll.d));
		if (o.mode === "res") {
			if (poll.n) box.appendChild(results(poll, o.mine));
			else box.appendChild(el("p", "pl-hidden", hiddenNote(poll, o.mine)));
			if (o.mine && !o.preview) {
				var y = el("p", "pl-yours"); y.textContent = "Your vote: " + o.mine.map(function (i) { return poll.o[i]; }).join(", ");
				box.appendChild(y);
			}
			return;
		}
		box.appendChild(el("p", "pl-hint", poll.m > 1 ? "Pick up to " + poll.m + "." : "Pick one."));
		var form = el("form", "pl-opts"), name = "pl-v" + Math.random().toString(36).slice(2, 7), type = poll.m > 1 ? "checkbox" : "radio";
		form.setAttribute("aria-label", "Options");
		var opts = poll.o.length ? poll.o : ["Option 1", "Option 2"];
		opts.forEach(function (t, i) {
			var lab = el("label", "pl-opt"), inp = el("input"); inp.type = type; inp.name = name; inp.value = i;
			if (o.mine && o.mine.indexOf(i) >= 0) inp.checked = true;
			if (o.preview) inp.tabIndex = -1;
			lab.appendChild(inp); var mk = el("span", "pl-mark pl-b" + (i % NCOL)); mk.setAttribute("aria-hidden", "true"); lab.appendChild(mk); lab.appendChild(el("span", "pl-otext", t));
			if (!poll.o.length) lab.classList.add("pl-ph");
			form.appendChild(lab);
		});
		var row = el("div", "pl-vrow"), btn = el("button", "tu-btn tu-btn--primary pl-vote", o.mine ? "Change my vote" : "Vote"); btn.type = "submit";
		var cnt = el("span", "pl-sel");
		row.appendChild(btn); row.appendChild(cnt);
		if (o.cancel) { var cb = el("button", "tu-btn tu-btn--ghost", "Cancel"); cb.type = "button"; cb.addEventListener("click", o.cancel); row.appendChild(cb); }
		form.appendChild(row);
		function sync() {
			var picked = form.querySelectorAll("input:checked").length;
			if (type === "checkbox") Array.prototype.forEach.call(form.querySelectorAll("input"), function (x) { x.disabled = !x.checked && picked >= poll.m; x.parentNode.classList.toggle("pl-off", x.disabled); });
			Array.prototype.forEach.call(form.querySelectorAll("input"), function (x) { x.parentNode.classList.toggle("pl-on", x.checked); });
			btn.disabled = !picked || !!o.busy;
			cnt.textContent = type === "checkbox" ? picked + " of " + poll.m + " picked" : "";
		}
		form.addEventListener("change", sync);
		form.addEventListener("submit", function (e) {
			e.preventDefault(); if (o.preview) return;
			var picks = Array.prototype.map.call(form.querySelectorAll("input:checked"), function (x) { return +x.value; });
			if (picks.length && o.onVote) o.onVote(picks, btn);
		});
		box.appendChild(form);
		sync();
	}

	/* ---------- the poll view ---------- */
	var V = { id: null, poll: null, mine: null, owner: false, key: "", skew: 0, editing: false, timer: 0, tick: 0, busy: false, lastFetch: 0 };
	function msg(text, kind) { var m = $("pl-msg"); m.textContent = text || ""; m.hidden = !text; m.className = "tu-card pl-msg" + (kind ? " pl-msg--" + kind : ""); }
	function statusText(p) {
		var now = Date.now() + V.skew;
		if (!p.open || p.closes <= now) return [["Closed", "pl-chip--closed"], [p.x ? "closed " + fmtDate(p.x) : "ended " + fmtDate(p.closes), ""]];
		if (!p.cl) return [["Open", "pl-chip--open"], ["until the creator closes it", ""]];
		return [["Open", "pl-chip--open"], ["closes in " + P.left(p.closes - now), "pl-cd"], [fmtDate(p.closes), "pl-chip--when"]];
	}
	function fmtDate(ms) { try { return new Date(ms).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return new Date(ms).toString(); } }
	function paintStatus() {
		var p = V.poll, s = $("pl-status"); if (!p) return;
		s.textContent = "";
		statusText(p).forEach(function (c) { s.appendChild(el("span", "pl-chip " + c[1], c[0])); });
		if (p.m > 1) s.appendChild(el("span", "pl-chip", "up to " + p.m + " picks"));
		if (V.owner) s.appendChild(el("span", "pl-chip pl-chip--own", "your poll"));
		var now = Date.now() + V.skew;
		if (p.open && p.cl && p.closes <= now && !V.busy && Date.now() - V.lastFetch > 1500) refresh();
	}
	function paintView() {
		var p = V.poll; if (!p) return;
		var now = Date.now() + V.skew, open = p.open && p.closes > now;
		var showForm = open && (!V.mine || V.editing);
		drawPoll($("pl-poll"), p, {
			mine: V.mine, mode: showForm ? "vote" : "res", busy: V.busy, onVote: vote,
			cancel: V.editing ? function () { V.editing = false; paintView(); } : null
		});
		if (!showForm && open && V.mine && p.ch) {
			var cb = el("button", "tu-btn pl-change", "Change my vote"); cb.type = "button";
			cb.addEventListener("click", function () { V.editing = true; paintView(); });
			$("pl-poll").appendChild(cb);
		}
		if (showForm && p.n && p.sh === "always" && !V.editing) {
			var peek = el("details", "pl-peek"), s = el("summary", null, "See the results so far"); peek.appendChild(s); peek.appendChild(results(p, null));
			$("pl-poll").appendChild(peek);
		}
		if (V.owner && showForm && !V.editing && p.sh !== "always") {
			var own = el("button", "tu-btn tu-btn--ghost pl-change", "Show me the results (you made this poll)"); own.type = "button";
			own.addEventListener("click", function () { V.ownerView = true; paintView(); });
			if (!V.ownerView) $("pl-poll").appendChild(own);
		}
		if (V.owner && V.ownerView && showForm && p.n) { $("pl-poll").appendChild(results(p, null)); }
		$("pl-close").hidden = !(V.owner && open);
		$("pl-del").hidden = !V.owner;
		$("pl-report").hidden = V.owner;
		var note = [];
		if (p.hidden) note.push("This poll is hidden from everyone else because people reported it. You can still see it because you made it.");
		if (open && p.ch) note.push("You can change your vote while the poll is open.");
		if (open && !p.ch && !V.mine) note.push("You can vote once.");
		if (p.sh === "voted") note.push("Results are shown to people who have voted.");
		if (p.sh === "closed" && open) note.push("Results are shown when voting ends.");
		if (open && (p.n || V.owner)) note.push("Results update by themselves.");
		$("pl-vnote").textContent = note.join(" ");
		paintStatus();
	}
	function accept(j) {
		if (j.poll || j.q) { var p = j.poll || j; V.skew = (p.now || Date.now()) - Date.now(); V.poll = p; }
		if (j.mine !== undefined && j.mine) { V.mine = j.mine; S.voted[V.id] = j.mine; save(); }
		if (j.owner !== undefined) V.owner = j.owner || !!V.key;
		if (V.poll && mineOf(V.id)) { status[V.id] = V.poll; renderMine(); }
	}
	function refresh() {
		if (V.hive) return hiveLoad();
		if (!V.id) return Promise.resolve();
		V.lastFetch = Date.now();
		var p = V.poll, usePeek = V.key || (p ? p.sh === "voted" && V.mine : V.mine);
		var req = usePeek ? api("POST", { act: "peek", id: V.id, vid: S.vid, key: V.key || undefined }) : api("GET", null, V.id);
		return req.then(function (j) {
			if (j._code === 410) { V.poll = null; $("pl-view").hidden = true; msg("This poll was hidden because several people reported it. We review reported polls and remove the ones that break the rules.", "warn"); stopTimers(); return; }
			if (j._code === 404) { V.poll = null; $("pl-view").hidden = true; msg("This poll does not exist any more: it was deleted, or it closed more than 60 days ago.", "warn"); stopTimers(); var m = mineOf(V.id); if (m) { m.gone = true; save(); renderMine(); } return; }
			if (j._code !== 200) return;
			accept(j);
			if (!V.editing) paintView(); else paintStatus();
		});
	}
	function stopTimers() { clearInterval(V.timer); clearInterval(V.tick); V.timer = V.tick = 0; }
	function startTimers() {
		stopTimers();
		V.tick = setInterval(function () { if (V.poll && V.poll.open && V.poll.cl) { var cd = document.querySelector("#pl-status .pl-cd"); if (cd) cd.textContent = "closes in " + P.left(V.poll.closes - Date.now() - V.skew); if (V.poll.closes - Date.now() - V.skew <= 0) paintStatus(); } }, 1000);
		V.timer = setInterval(function () {
			if (document.hidden || !V.poll || V.busy || V.editing) return;
			var p = V.poll, open = p.open && p.closes > Date.now() + V.skew;
			if (!open) return;
			var every = V.hive ? 20000 : (p.n || V.owner) ? 4000 : 15000;
			if (Date.now() - V.lastFetch >= every - 200) refresh();
		}, 1000);
	}
	function vote(picks, btn) {
		if (V.busy) return; V.busy = true; btn.disabled = true; btn.textContent = "Sending…";
		api("POST", { act: "vote", id: V.id, vid: S.vid, picks: picks, t: Date.now() - T0, hp: ($("pl-hp") || {}).value || "" }).then(function (j) {
			V.busy = false;
			if (j._code === 200) { accept(j); V.editing = false; toast(j.changed ? "Vote changed" : "Thanks, your vote is in"); }
			else { accept(j); toast(j.error ? j.error.charAt(0).toUpperCase() + j.error.slice(1) : "Could not vote, try again"); if (j.mine) V.editing = false; }
			paintView();
		});
	}
	function openPoll(id, force) {
		if (S.hide[id] && !force && !mineOf(id)) {
			stopTimers(); V.id = id; V.poll = null; $("pl-view").hidden = true;
			msg("You hid this poll on this device.", "");
			var b = el("button", "tu-btn pl-unhide", "Show it anyway"); b.type = "button";
			b.addEventListener("click", function () { delete S.hide[id]; save(); openPoll(id, true); });
			$("pl-msg").appendChild(b);
			return Promise.resolve();
		}
		V.id = id; V.mine = Array.isArray(S.voted[id]) ? S.voted[id] : null; var m = mineOf(id); V.key = m && m.key || ""; V.owner = !!V.key;
		$("pl-view").hidden = false; msg("");
		$("pl-poll").innerHTML = '<p class="pl-loading">Loading the poll…</p>';
		var meta = document.querySelector('meta[name="robots"]'); if (!meta) { meta = el("meta"); meta.name = "robots"; document.head.appendChild(meta); } meta.content = "noindex";
		$("pl-make-h").textContent = "Make your own poll";
		return refresh().then(function () { if (V.poll) { document.title = V.poll.q + " | MES Polls"; startTimers(); } });
	}
	function wireView() {
		$("pl-copy").addEventListener("click", function () { copy(curLink(), "Link copied"); });
		$("pl-qrbtn").addEventListener("click", function () { qr($("pl-qr"), curLink()); });
		if (navigator.share) { $("pl-share").hidden = false; $("pl-share").addEventListener("click", function () { navigator.share({ title: V.poll ? V.poll.q : "Poll", text: V.poll ? V.poll.q : "", url: curLink() }).catch(function () {}); }); }
		$("pl-close").addEventListener("click", function () { if (confirm("Close this poll now? Nobody can vote after this, and it cannot be opened again.")) manage(V.id, "close"); });
		$("pl-del").addEventListener("click", function () { if (confirm("Delete this poll and all its votes for good?")) manage(V.id, "del"); });
		var rb = $("pl-repbox");
		$("pl-report").addEventListener("click", function () { rb.hidden = !rb.hidden; if (!rb.hidden) { var f = rb.querySelector("input[type=radio]"); if (f) f.focus(); } });
		$("pl-repcancel").addEventListener("click", function () { rb.hidden = true; });
		rb.addEventListener("submit", function (e) {
			e.preventDefault();
			var c = rb.querySelector("input[name=pl-r]:checked");
			if (!c) { toast("Pick what is wrong with it"); return; }
			var id = V.id, hide = $("pl-rephide").checked, btn = $("pl-repsend"); btn.disabled = true;
			api("POST", { act: "report", id: id, vid: S.vid, r: c.value }).then(function (j) {
				btn.disabled = false;
				if (j._code !== 200) { toast(j.error ? j.error.charAt(0).toUpperCase() + j.error.slice(1) : "Could not send the report, try again"); return; }
				rb.hidden = true; c.checked = false;
				if (hide) { S.hide[id] = Date.now(); save(); stopTimers(); V.poll = null; $("pl-view").hidden = true; msg("Thanks, your report was sent. This poll is now hidden on this device.", ""); }
				else toast(j.again ? "You already reported this poll" : "Thanks, your report was sent");
			});
		});
		var hp = el("input"); hp.type = "text"; hp.id = "pl-hp"; hp.name = "website"; hp.tabIndex = -1; hp.autocomplete = "off"; hp.className = "pl-hp"; hp.setAttribute("aria-hidden", "true"); root.appendChild(hp);
		function panel() { if (window.MESPanel) window.MESPanel.add($("pl-view"), { bar: $("pl-vbar") }); }
		if (window.MESPanel) panel(); else document.addEventListener("DOMContentLoaded", panel);
	}
	function manage(id, act) {
		var m = mineOf(id); if (!m) return;
		api("POST", { act: act, id: id, key: m.key }).then(function (j) {
			if (j._code === 200) {
				if (act === "del") { S.mine = S.mine.filter(function (x) { return x.id !== id; }); delete S.voted[id]; save(); toast("Poll deleted"); if (V.id === id) { V.poll = null; stopTimers(); $("pl-view").hidden = true; msg("The poll was deleted.", ""); } }
				else { toast("Poll closed"); if (V.id === id) { accept(j); paintView(); } }
				renderMine();
			} else if (j._code === 404) { m.gone = true; save(); renderMine(); toast("That poll no longer exists"); }
			else toast(j.error || "Could not do that, try again");
		});
	}

	/* ---------- QR code (qrcode-generator, loaded on first use) ---------- */
	var qrLib = null;
	function loadQr() {
		if (window.qrcode) return Promise.resolve(window.qrcode);
		if (qrLib) return qrLib;
		qrLib = new Promise(function (ok, no) { var s = el("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"; s.onload = function () { ok(window.qrcode); }; s.onerror = function () { qrLib = null; no(); }; document.head.appendChild(s); });
		return qrLib;
	}
	function qr(box, url) {
		if (!box.hidden && box.dataset.url === url) { box.hidden = true; return; }
		box.hidden = false; box.dataset.url = url; box.textContent = "Making the QR code…";
		loadQr().then(function (q) {
			var c = q(0, "M"); c.addData(url); c.make();
			box.innerHTML = '<div class="pl-qrimg">' + c.createSvgTag({ cellSize: 6, margin: 3, scalable: true }) + "</div>";
			var p = el("p", "tu-note", "Scan it with a phone camera to open " + url.replace(/^https?:\/\//, "") + "."); box.appendChild(p);
			var a = el("a", "tu-btn", "Download the QR code"); a.download = "poll-qr.svg";
			a.href = URL.createObjectURL(new Blob([c.createSvgTag({ cellSize: 10, margin: 4 })], { type: "image/svg+xml" })); box.appendChild(a);
		}, function () { box.textContent = "Could not load the QR code maker. Check your connection."; });
	}

	/* ---------- My polls ---------- */
	var status = {};
	function renderMine() {
		var list = $("pl-mine"), on = S.mine.length > 0;
		$("pl-mine-h").hidden = $("pl-mine-card").hidden = !on;
		if (!on) return;
		list.textContent = "";
		var ul = el("ul", "pl-mlist");
		S.mine.slice().sort(function (a, b) { return b.c - a.c; }).forEach(function (m) {
			var li = el("li", "pl-mrow" + (m.gone ? " pl-gone" : ""));
			if (m.hive) { li.appendChild(hiveMineRow(m)); ul.appendChild(li); return; }
			var a = el("a", "pl-mq", m.q || m.id); a.href = (MOCK ? "/polls?p=" : "/v/") + m.id;
			var info = el("span", "pl-minfo");
			var st = status[m.id];
			info.textContent = m.gone ? "gone (deleted or expired)" : st ? (st.open && st.closes > Date.now() ? "open" + (st.cl ? ", closes in " + P.left(st.closes - Date.now()) : "") : "closed") + " · " + st.v + (st.v === 1 ? " vote" : " votes") : "made " + fmtDate(m.c);
			var btns = el("span", "pl-mbtns");
			function b(txt, fn, cls) { var x = el("button", "tu-btn " + (cls || ""), txt); x.type = "button"; x.addEventListener("click", fn); btns.appendChild(x); }
			if (!m.gone) {
				b("Copy link", function () { copy(shareUrl(m.id), "Link copied"); });
				if (!st || st.open) b("Close", function () { if (confirm("Close \"" + (m.q || m.id) + "\" now? Nobody can vote after this.")) manage(m.id, "close"); });
				b("Delete", function () { if (confirm("Delete \"" + (m.q || m.id) + "\" and all its votes for good?")) manage(m.id, "del"); }, "pl-danger");
			} else b("Remove from list", function () { S.mine = S.mine.filter(function (x) { return x.id !== m.id; }); save(); renderMine(); });
			li.appendChild(a); li.appendChild(info); li.appendChild(btns);
			ul.appendChild(li);
		});
		list.appendChild(ul);
	}
	function loadStatuses() {
		S.mine.slice().sort(function (a, b) { return b.c - a.c; }).slice(0, 12).forEach(function (m) {
			if (m.gone || m.hive) return;
			api("POST", { act: "peek", id: m.id, key: m.key }).then(function (j) {
				if (j._code === 404) { m.gone = true; save(); }
				else if (j._code === 200 && j.poll) status[m.id] = j.poll;
				renderMine();
			});
		});
	}

	/* ---------- the maker ---------- */
	var D = { q: "", d: "", o: ["", ""], kind: "one", m: 2, end: "manual", dur: 1, unit: "day", date: "", time: "", sh: "always", ch: false,
		where: "mes", htitle: "", htitleEdited: false, htags: "polls", hcomm: "", hage: 0, hdecline: false, hbody: "", hbodyEdited: false };
	var pv = "vote";
	try { var dd = JSON.parse(localStorage.getItem(DKEY) || "null"); if (dd && typeof dd === "object") for (var k in D) if (dd[k] !== undefined && typeof dd[k] === typeof D[k]) D[k] = dd[k]; } catch (e) {}
	if (!Array.isArray(D.o) || D.o.length < 2) D.o = ["", ""];
	function saveDraft() { try { localStorage.setItem(DKEY, JSON.stringify(D)); } catch (e) {} }
	function opts() { return D.o.map(function (x) { return String(x || "").trim(); }).filter(Boolean); }
	function closeMs() {
		if (D.end === "after") { var ms = P.durMs(D.dur, D.unit); return ms > 0 ? Date.now() + ms : NaN; }
		if (D.end === "at") { if (!D.date) return NaN; var t = new Date(D.date + "T" + (D.time || "23:59")); return isNaN(t) ? NaN : t.getTime(); }
		return 0;
	}
	function draftPoll() {
		var o = opts(), m = D.kind === "many" ? Math.min(D.m, Math.max(2, o.length)) : 1, cl = closeMs();
		return { q: D.q.trim(), d: D.d.trim(), o: o, m: m, cl: isNaN(cl) ? 0 : cl, sh: D.sh, ch: D.ch, open: true, closes: cl || Date.now() + 366 * 864e5, v: 0 };
	}
	function demoCounts(n) { var base = [7, 4, 3, 2, 2, 1]; var out = []; for (var i = 0; i < n; i++) out.push(base[i] !== undefined ? base[i] : 1); return out; }
	function renderOptions(focusIdx) {
		var ol = $("pl-olist"); ol.textContent = "";
		while (D.o.length < 20 && D.o[D.o.length - 1] && D.o[D.o.length - 1].trim()) D.o.push("");
		D.o.forEach(function (v, i) {
			var li = el("li", "pl-oitem"), inp = el("input", "tu-input"); inp.type = "text"; inp.maxLength = 100; inp.value = v; inp.placeholder = "Option " + (i + 1); inp.setAttribute("aria-label", "Option " + (i + 1)); inp.autocomplete = "off";
			var sw = el("span", "pl-sw pl-b" + (i % NCOL)); sw.setAttribute("aria-hidden", "true");
			inp.addEventListener("input", function () { D.o[i] = inp.value; var last = i === D.o.length - 1; if (last && inp.value.trim() && D.o.length < 20) { D.o.push(""); renderOptions(i); } else changed(); });
			inp.addEventListener("keydown", function (e) {
				if (e.key === "Enter") { e.preventDefault(); var nx = ol.querySelectorAll("input")[i + 1]; if (nx) nx.focus(); else if (D.o.length < 20) { D.o.push(""); renderOptions(i + 1); } }
				if (e.key === "Backspace" && !inp.value && D.o.length > 2) { e.preventDefault(); D.o.splice(i, 1); renderOptions(Math.max(0, i - 1)); }
			});
			var up = el("button", "pl-ib", "↑"); up.type = "button"; up.title = "Move up"; up.setAttribute("aria-label", "Move option " + (i + 1) + " up"); up.disabled = i === 0;
			up.addEventListener("click", function () { var t = D.o[i]; D.o[i] = D.o[i - 1]; D.o[i - 1] = t; renderOptions(i - 1); });
			var rm = el("button", "pl-ib", "✕"); rm.type = "button"; rm.title = "Remove"; rm.setAttribute("aria-label", "Remove option " + (i + 1)); rm.disabled = D.o.length <= 2;
			rm.addEventListener("click", function () { D.o.splice(i, 1); if (D.o.length < 2) D.o.push(""); renderOptions(Math.min(i, D.o.length - 1)); });
			li.appendChild(sw); li.appendChild(inp); li.appendChild(up); li.appendChild(rm); ol.appendChild(li);
		});
		$("pl-oadd").disabled = D.o.length >= 20;
		if (focusIdx != null) { var f = ol.querySelectorAll("input")[focusIdx]; if (f) { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {} } }
		changed();
	}
	function changed() {
		var o = opts();
		$("pl-ocount").textContent = o.length + " of 20";
		var mx = $("pl-max"), want = Math.max(2, o.length), cur = D.m;
		if (mx.options.length !== want - 1) { mx.textContent = ""; for (var i = 2; i <= want; i++) { var op = el("option", null, i === want ? i + " (all)" : String(i)); op.value = i; mx.appendChild(op); } }
		D.m = Math.min(Math.max(2, cur), want); mx.value = D.m;
		$("pl-maxwrap").hidden = D.kind !== "many";
		$("pl-afterrow").hidden = D.end !== "after"; $("pl-atrow").hidden = D.end !== "at";
		var cl = closeMs(), en = $("pl-endnote");
		if (D.where === "hive" && D.end === "manual") { D.end = "after"; setRadios("pl-end", "after"); if (!D.dur) D.dur = 1; $("pl-afterrow").hidden = false; $("pl-atrow").hidden = true; cl = closeMs(); }
		if (D.where === "hive" && D.sh === "closed") { D.sh = "voted"; setRadios("pl-sh", "voted"); }
		if (D.end === "manual") en.textContent = "Close it from My polls when you are done (it closes by itself after a year).";
		else if (isNaN(cl)) en.textContent = D.end === "at" ? "Pick a date (and a time)." : "Type how long.";
		else en.textContent = "Voting ends " + fmtDate(cl) + " (in " + P.left(cl - Date.now()) + ").";
		$("pl-err").hidden = true;
		hiveMakerSync();
		saveDraft();
		var p = draftPoll();
		if (pv === "res") { p.n = demoCounts(Math.max(2, p.o.length)); p.v = p.n.reduce(function (a, b) { return a + b; }, 0); if (!p.o.length) p.o = ["Option 1", "Option 2"]; }
		drawPoll($("pl-prev"), p, { mode: pv, preview: true });
		if (pv === "res") $("pl-prev").appendChild(el("p", "tu-note pl-demo", "Made-up numbers, to show what the results look like."));
	}
	function setRadios(name, val) { Array.prototype.forEach.call(root.querySelectorAll('input[name="' + name + '"]'), function (r) { r.checked = r.value === val; }); }
	function fillForm() {
		$("pl-mq").value = D.q; $("pl-md").value = D.d; if (D.d) $("pl-mddet").open = true;
		setRadios("pl-kind", D.kind); setRadios("pl-end", D.end); setRadios("pl-sh", D.sh); $("pl-ch").checked = D.ch;
		$("pl-dur").value = D.dur; $("pl-unit").value = D.unit; setVal("pl-date", D.date); setVal("pl-time", D.time);
		setRadios("pl-where", D.where); $("pl-htitle").value = D.htitle; $("pl-htags").value = D.htags; $("pl-hcomm").value = D.hcomm; $("pl-hage").value = D.hage; $("pl-hdecline").checked = D.hdecline; $("pl-hbody").value = D.hbody;
		renderOptions();
	}
	function setVal(id, v) { var e = $(id); e.value = v; }
	function create() {
		if (D.where === "hive") return createHive();
		var p = draftPoll(), cl = closeMs(), probs = P.problems({ q: p.q, d: p.d, o: p.o, cl: cl || 0 });
		if (D.end !== "manual" && isNaN(cl)) probs.unshift(D.end === "at" ? "Pick the date when voting ends." : "Type how long the poll stays open.");
		var err = $("pl-err");
		if (probs.length) { err.textContent = probs[0]; err.hidden = false; return; }
		var go = $("pl-go"); go.disabled = true; go.textContent = "Creating…";
		api("POST", { act: "new", q: p.q, d: p.d, o: p.o, m: p.m, cl: cl ? Math.round(cl) : 0, sh: p.sh, ch: p.ch }).then(function (j) {
			go.disabled = false; go.textContent = "Create the poll";
			if (j._code !== 200 || !j.id) { err.textContent = j.error ? j.error.charAt(0).toUpperCase() + j.error.slice(1) + "." : "Could not create the poll, try again."; err.hidden = false; return; }
			S.mine.unshift({ id: j.id, key: j.key, q: p.q, c: Date.now() }); save(); renderMine();
			showDone(j.id, j.key, p.q);
		});
	}
	function showDone(id, key, q) {
		var d = $("pl-done"); d.hidden = false;
		$("pl-dlink").value = shareUrl(id);
		$("pl-dopen").href = (MOCK ? "/polls?p=" : "/v/") + id;
		d.dataset.id = id; d.dataset.key = key; d.dataset.q = q;
		$("pl-dqrbox").hidden = true;
		d.scrollIntoView({ behavior: "smooth", block: "center" });
		$("pl-dcopy").focus();
	}
	function wireMaker() {
		$("pl-mq").addEventListener("input", function () { D.q = this.value; changed(); });
		$("pl-md").addEventListener("input", function () { D.d = this.value; changed(); });
		$("pl-oadd").addEventListener("click", function () { if (D.o.length < 20) { if (D.o[D.o.length - 1].trim()) D.o.push(""); renderOptions(D.o.length - 1); } });
		$("pl-opaste").addEventListener("click", function () { $("pl-pastebox").hidden = !$("pl-pastebox").hidden; if (!$("pl-pastebox").hidden) $("pl-ptext").focus(); });
		$("pl-pcancel").addEventListener("click", function () { $("pl-pastebox").hidden = true; });
		$("pl-puse").addEventListener("click", function () { var o = P.optionsFromText($("pl-ptext").value); if (o.length < 1) { toast("Nothing to use"); return; } var cur = opts(); D.o = cur.concat(o).slice(0, 20); if (D.o.length < 2) D.o.push(""); $("pl-ptext").value = ""; $("pl-pastebox").hidden = true; renderOptions(); toast(o.length + (o.length === 1 ? " option" : " options") + " added"); });
		root.addEventListener("change", function (e) {
			var t = e.target;
			if (t.name === "pl-kind") D.kind = t.value; else if (t.name === "pl-end") { D.end = t.value; if (D.end === "at" && !D.date) { var d = new Date(Date.now() + 864e5); D.date = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); D.time = "18:00"; setVal("pl-date", D.date); setVal("pl-time", D.time); } }
			else if (t.name === "pl-sh") D.sh = t.value; else if (t.id === "pl-ch") D.ch = t.checked;
			else if (t.id === "pl-max") D.m = +t.value; else if (t.id === "pl-unit") D.unit = t.value;
			else if (t.id === "pl-date") D.date = t.value; else if (t.id === "pl-time") D.time = t.value;
			else if (t.name === "pl-where") D.where = t.value; else if (t.id === "pl-hdecline") D.hdecline = t.checked;
			else return;
			changed();
		});
		["pl-date", "pl-time"].forEach(function (id) { $(id).addEventListener("input", function () { D[id.slice(3)] = this.value; changed(); }); });
		$("pl-dur").addEventListener("input", function () { D.dur = Math.max(0, +this.value || 0); changed(); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-dur]"), function (b) { b.addEventListener("click", function () { var p = b.getAttribute("data-dur").split(","); D.dur = +p[0]; D.unit = p[1]; $("pl-dur").value = D.dur; $("pl-unit").value = D.unit; changed(); }); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-pv]"), function (b) { b.addEventListener("click", function () { pv = b.getAttribute("data-pv"); Array.prototype.forEach.call(root.querySelectorAll("[data-pv]"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); }); changed(); }); });
		$("pl-go").addEventListener("click", create);
		$("pl-reset").addEventListener("click", function () { if ((D.q || opts().length) && !confirm("Clear the question and options?")) return; D.q = ""; D.d = ""; D.o = ["", ""]; fillForm(); $("pl-mq").focus(); });
		$("pl-mq").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var f = $("pl-olist").querySelector("input"); if (f) f.focus(); } });
		$("pl-zone").textContent = "In your time zone (" + (Intl.DateTimeFormat().resolvedOptions().timeZone || "local time") + "). Everyone sees the closing time in their own time zone.";
		// done card
		$("pl-dcopy").addEventListener("click", function () { copy($("pl-dlink").value, "Link copied"); });
		$("pl-dtext").addEventListener("click", function () { var d = $("pl-done"); copy(d.dataset.q + "\nVote here: " + $("pl-dlink").value, "Text copied"); });
		$("pl-dqr").addEventListener("click", function () { qr($("pl-dqrbox"), $("pl-dlink").value); });
		$("pl-dmgr").addEventListener("click", function () { var d = $("pl-done"); copy(location.origin + "/polls?p=" + d.dataset.id + "#k=" + d.dataset.key, "Manager link copied: keep it private"); });
		$("pl-dnew").addEventListener("click", function () { $("pl-done").hidden = true; D.q = ""; D.d = ""; D.o = ["", ""]; fillForm(); $("pl-mq").focus(); });
		$("pl-dlink").addEventListener("focus", function () { this.select(); });
		// open a poll by link
		function go() { var v = $("pl-goid").value, id = P.idFromText(v), hr = !id && HP.ref(v); if (hr) { location.href = hivePath(hr); return; } if (!id) { toast("That is not a poll link"); return; } location.href = (MOCK ? "/polls?p=" : "/v/") + id; }
		$("pl-goopen").addEventListener("click", go);
		$("pl-goid").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
		function when() { if (window.MESWhen && !root.querySelector(".mes-when")) MESWhen.attach({ anchor: $("pl-atrow").querySelector(".tu-row"), date: "pl-date", time: "pl-time", label: "Or type it in words", placeholder: "next Friday 6 pm, Nov 30 noon" }); }
		if (window.MESWhen) when(); else document.addEventListener("DOMContentLoaded", when);
		wireHiveMaker();
	}

	/* ---------- Hive polls (Hive Open Polls protocol; helpers in lib.js = MESPoll.hive, Keychain + RPC through main_js/hive.js = MESHive) ----------
	 * Viewer: the post is read from the chain; who voted comes from PeakD's open polls node (polls.hivehub.dev, a public HAF API), then every vote is
	 * read from its own block (get_ops_in_block at the vote's time) and counted here with the poll's rules. The logged-in account's own recent votes
	 * are read from its account history, so a fresh vote counts before the node has indexed it. */
	var POLLS_API = "https://polls.hivehub.dev";
	var HV = { poll: null, pid: 0, trx: "", apiOk: null, api: [], ops: {}, chk: {}, created: {}, pending: null, head: null, busy: false, editing: false, loading: false };
	function MH() { return window.MESHive || null; }
	function hUser() { var h = MH(); var u = h && h.user(); return u ? u.name : ""; }
	function kc(fn) {
		return (MH() ? MH().keychain() : Promise.resolve(window.hive_keychain || null)).then(function (k) {
			if (!k) { var e = new Error("Hive Keychain is not installed in this browser."); e.code = "nokeychain"; throw e; }
			return new Promise(function (ok, no) { fn(k, function (r) { if (r && r.success) ok(r); else no(new Error((r && (r.message || r.error)) || "Cancelled in Keychain")); }); });
		});
	}
	function rpc(m, p) { return MH() ? MH().call(m, p) : Promise.reject(new Error("Hive helpers did not load")); }
	function jget(url) { return fetch(url, { cache: "no-store" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }); }
	function sKey(a, t) { return "mes-polls:chk:" + (HV.poll ? HV.poll.author + "/" + HV.poll.permlink : "") + ":" + a + ":" + t; }
	/** the login strip (used in the maker and the viewer) */
	function loginBox(box, why) {
		box.textContent = "";
		var h = MH(), u = hUser();
		if (u) {
			var p = el("p", "pl-hwho"); p.appendChild(document.createTextNode((why || "Signed in as") + " "));
			var img = el("img", "pl-hav"); img.alt = ""; img.width = 22; img.height = 22; img.src = h.avatar(u, "small"); p.appendChild(img);
			p.appendChild(el("strong", null, "@" + u));
			var lo = el("button", "tu-btn tu-btn--ghost pl-hlo", "Log out"); lo.type = "button"; lo.addEventListener("click", function () { h.logout(); }); p.appendChild(lo);
			box.appendChild(p); return;
		}
		var row = el("div", "pl-link pl-hrow"), inp = el("input", "tu-input"); inp.type = "text"; inp.placeholder = "Your Hive username"; inp.autocomplete = "username"; inp.setAttribute("aria-label", "Hive username");
		var b = el("button", "tu-btn tu-btn--primary", "Log in with Hive Keychain"); b.type = "button";
		function go() {
			if (!h) { toast("The Hive helpers did not load; reload the page"); return; }
			b.disabled = true; b.textContent = "Check Keychain…";
			h.login(inp.value).then(function () { toast("Logged in"); }, function (e) {
				b.disabled = false; b.textContent = "Log in with Hive Keychain";
				if (e && e.code === "nokeychain") { var d = el("div"); d.innerHTML = h.helpHtml(); box.appendChild(d); } else toast(e && e.message || "Could not log in");
			});
		}
		b.addEventListener("click", go); inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
		row.appendChild(inp); row.appendChild(b); box.appendChild(row);
		box.appendChild(el("p", "tu-note pl-hnote", "Keychain proves you own the account by signing a message with your posting key; your keys never leave Keychain and mes.fm never sees them."));
	}
	function onLogin() { if (D.where === "hive") changed(); if (V.hive) { HV.editing = false; hivePaint(); if (hUser()) hiveOwn().then(hivePaint); } }
	if (window.MESHive) MESHive.onChange(onLogin); else document.addEventListener("DOMContentLoaded", function () { if (window.MESHive) MESHive.onChange(onLogin); });

	/* --- the maker in Hive mode --- */
	function hiveLinkFor() { var u = hUser() || "your-account"; return hiveUrl({ author: u, permlink: HP.permlink(D.htitle || D.q || "poll") }); }
	function hiveMakerSync() {
		var hive = D.where === "hive", box = $("pl-hive");
		box.hidden = !hive;
		$("pl-endmanual").hidden = hive; $("pl-shclosed").hidden = hive;
		$("pl-wherenote").textContent = hive ? "The poll becomes a post on your Hive account; Hive accounts vote with Keychain, and it shows as a poll on PeakD, Ecency and HiveHub too." : "Anyone with the link can vote, no sign-up.";
		$("pl-gonote").textContent = hive ? "Publishing needs Hive Keychain. Voting is free for Hive accounts (a custom_json, no fee)." : "Anyone with the link can vote. Polls are not listed anywhere and are not shown in search engines.";
		var go = $("pl-go"); if (!go.disabled) go.textContent = hive ? "Publish on Hive" : "Create the poll";
		if (!hive) return;
		if (!D.htitleEdited) { D.htitle = D.q.trim(); $("pl-htitle").value = D.htitle; }
		if (!D.hbodyEdited) { var cl = closeMs(); D.hbody = HP.defaultBody({ question: D.q.trim() || "Your question", description: D.d.trim(), choices: opts().length ? opts() : ["Option 1", "Option 2"], endMs: isNaN(cl) ? 0 : cl, link: hiveLinkFor() }); $("pl-hbody").value = D.hbody; }
		$("pl-hbodynote").textContent = D.hbodyEdited ? "You edited the text; it no longer follows the question." : "Follows your question and choices until you edit it.";
		var lb = $("pl-hlogin"); if (!lb.dataset.u || lb.dataset.u !== (hUser() || "-")) { lb.dataset.u = hUser() || "-"; loginBox(lb, "Posting as"); }
	}
	function wireHiveMaker() {
		$("pl-htitle").addEventListener("input", function () { D.htitle = this.value; D.htitleEdited = !!this.value.trim(); changed(); });
		$("pl-htags").addEventListener("input", function () { D.htags = this.value; saveDraft(); });
		$("pl-hcomm").addEventListener("input", function () { D.hcomm = this.value.trim().toLowerCase(); saveDraft(); });
		$("pl-hage").addEventListener("input", function () { D.hage = Math.max(0, Math.min(3650, Math.round(+this.value || 0))); saveDraft(); });
		$("pl-hbody").addEventListener("input", function () { D.hbody = this.value; D.hbodyEdited = true; $("pl-hbodynote").textContent = "You edited the text; it no longer follows the question."; saveDraft(); });
		$("pl-hbodyreset").addEventListener("click", function () { D.hbodyEdited = false; changed(); });
	}
	function createHive() {
		var err = $("pl-err"), u = hUser();
		function fail(t) { err.textContent = t; err.hidden = false; }
		if (!u) { fail("Log in with Hive Keychain first (above the post title)."); var i = $("pl-hlogin").querySelector("input"); if (i) i.focus(); return; }
		var cl = closeMs(), title = (D.htitle || D.q).trim(), permlink = HP.permlink(title), ref = { author: u, permlink: permlink };
		var body = String(D.hbody || "").replace(/https?:\/\/[^\s)]*\/(?:polls\?h=|hp\/)[^\s)]*/g, hiveUrl(ref));
		var o = { title: title, body: body, question: D.q, description: D.d.trim(), choices: opts(), endMs: cl, tags: HP.tags(D.htags), community: D.hcomm,
			max: D.kind === "many" ? Math.min(D.m, opts().length) : 1, changes: D.ch, hide: D.sh !== "always", ageDays: D.hage, permlink: permlink };
		var probs = HP.problems(o);
		if (probs.length) { fail(probs[0]); return; }
		var post = HP.buildPost(o);
		if (!confirm("Publish this poll as a public post from @" + u + "?\n\nIt goes on the Hive blockchain: the question, choices and end time can never be changed, and the post cannot be deleted.")) return;
		var copts = D.hdecline ? JSON.stringify({ author: u, permlink: permlink, max_accepted_payout: "0.000 HBD", percent_hbd: 10000, allow_votes: true, allow_curation_rewards: true, extensions: [] }) : "";
		var go = $("pl-go"); go.disabled = true; go.textContent = "Waiting for Keychain…";
		kc(function (k, done) { k.requestPost(u, post.title, post.body, post.parentPermlink, "", post.meta, permlink, copts, done); }).then(function () {
			go.disabled = false; go.textContent = "Publish on Hive";
			S.mine.unshift({ id: "h:" + u + "/" + permlink, hive: u + "/" + permlink, q: D.q.trim(), c: Date.now(), end: cl }); save(); renderMine();
			showDoneHive(ref, D.q.trim());
		}, function (e) { go.disabled = false; go.textContent = "Publish on Hive"; fail(e.message === "Cancelled in Keychain" ? "Not published (cancelled in Keychain)." : "Not published: " + e.message); });
	}
	function showDoneHive(ref, q) {
		var d = $("pl-done"); d.hidden = false;
		$("pl-dh").textContent = "Your Hive poll is published";
		$("pl-dlink").value = hiveUrl(ref); $("pl-dopen").href = hivePath(ref);
		d.dataset.id = ""; d.dataset.q = q; $("pl-dmgr").hidden = true;
		var pk = $("pl-dpeakd"); pk.hidden = false; pk.href = "https://peakd.com/@" + ref.author + "/" + ref.permlink;
		$("pl-dnote").textContent = "It can take a few seconds to appear everywhere. Hive polls cannot be closed early or deleted; voting stops at the end time.";
		$("pl-dqrbox").hidden = true;
		d.scrollIntoView({ behavior: "smooth", block: "center" });
	}
	function hiveMineRow(m) {
		var r = HP.ref(m.hive), frag = document.createDocumentFragment();
		var a = el("a", "pl-mq", m.q || m.hive); a.href = hivePath(r); frag.appendChild(a);
		var open = m.end && m.end > Date.now();
		frag.appendChild(el("span", "pl-minfo", "Hive poll by @" + r.author + " · " + (m.end ? (open ? "closes in " + P.left(m.end - Date.now()) : "ended " + fmtDate(m.end)) : "made " + fmtDate(m.c))));
		var btns = el("span", "pl-mbtns");
		var c = el("button", "tu-btn", "Copy link"); c.type = "button"; c.addEventListener("click", function () { copy(hiveUrl(r), "Link copied"); }); btns.appendChild(c);
		var pk = el("a", "tu-btn", "PeakD"); pk.href = "https://peakd.com/@" + r.author + "/" + r.permlink; pk.target = "_blank"; pk.rel = "noopener"; btns.appendChild(pk);
		var rm = el("button", "tu-btn tu-btn--ghost", "Remove from list"); rm.type = "button"; rm.addEventListener("click", function () { S.mine = S.mine.filter(function (x) { return x !== m; }); save(); renderMine(); }); btns.appendChild(rm);
		frag.appendChild(btns);
		return frag;
	}

	/* --- the viewer --- */
	function openHive(ref) {
		V.hive = ref; V.id = null; V.owner = false; V.key = "";
		$("pl-view").hidden = false; msg("");
		$("pl-poll").innerHTML = '<p class="pl-loading">Loading the poll from Hive…</p>';
		var meta = document.querySelector('meta[name="robots"]'); if (!meta) { meta = el("meta"); meta.name = "robots"; document.head.appendChild(meta); } meta.content = "noindex";
		$("pl-make-h").textContent = "Make your own poll";
		$("pl-close").hidden = $("pl-del").hidden = $("pl-report").hidden = true; $("pl-repbox").hidden = true;
		var tries = 0;
		function getPost() {
			return rpc("condenser_api.get_content", [ref.author, ref.permlink]).then(function (post) {
				if ((!post || !post.author) && tries++ < 5 && S.mine.some(function (x) { return x.hive === ref.author + "/" + ref.permlink; })) {
					$("pl-poll").innerHTML = '<p class="pl-loading">Your post is on its way to the blockchain…</p>';
					return new Promise(function (ok) { setTimeout(ok, 3000); }).then(getPost);
				}
				return post;
			});
		}
		return getPost().then(function (post) {
			if (!post || !post.author) { $("pl-view").hidden = true; msg("There is no Hive post at @" + ref.author + "/" + ref.permlink + ".", "warn"); return; }
			var p = HP.parse(post);
			if (!p) { $("pl-view").hidden = true; msg("That Hive post is not a poll.", "warn"); return; }
			HV.poll = p; document.title = p.question + " | Hive poll | MES Polls";
			var mm = S.mine.filter(function (x) { return x.hive === p.author + "/" + p.permlink; })[0]; if (mm && !mm.end) { mm.end = p.end; save(); renderMine(); }
			hivePaint();
			return hiveLoad().then(function () { startTimers(); });
		}, function () { $("pl-poll").innerHTML = ""; msg("Could not reach a Hive node. Check your connection and reload.", "warn"); });
	}
	function hiveOpen() { return HV.poll && HV.poll.end > Date.now(); }
	/** the block that holds a vote made at time t (ms), found from the head block (3 s blocks) and corrected from the block's own time */
	function findVote(a, t) {
		var key = sKey(a, t);
		try { var c = sessionStorage.getItem(key); if (c) return Promise.resolve(JSON.parse(c)); } catch (e) {}
		var head = HV.head, g = head.n - Math.round((head.t - t) / 3000), tries = 0;
		function step() {
			if (tries++ > 7) return Promise.resolve(null);
			return rpc("condenser_api.get_ops_in_block", [g, false]).then(function (ops) {
				if (!ops || !ops.length) { g -= 1; return step(); }
				var d = Math.round((t - HP.utc(ops[0].timestamp)) / 3000);
				if (d !== 0) { g += d; return step(); }
				var hit = null;
				ops.forEach(function (o) { var op = o.op; if (op[0] === "custom_json" && op[1].id === "polls" && (op[1].required_posting_auths || []).indexOf(a) >= 0) { var v = HP.parseVote({ json: op[1].json, t: o.timestamp, auths: op[1].required_posting_auths }, HV.poll, HV.trx); if (v) hit = { json: op[1].json, t: o.timestamp, auths: op[1].required_posting_auths, block: g }; } });
				return hit;
			});
		}
		return step().then(function (hit) { try { sessionStorage.setItem(key, JSON.stringify(hit)); } catch (e) {} return hit; });
	}
	function pool(items, n, fn) {
		var i = 0; function next() { if (i >= items.length) return Promise.resolve(); var x = items[i++]; return fn(x).catch(function () {}).then(next); }
		var w = []; for (var k = 0; k < Math.min(n, items.length); k++) w.push(next()); return Promise.all(w);
	}
	/** the logged-in account's own recent poll votes, from its account history (custom_json only) */
	function hiveOwn() {
		var u = hUser(); if (!u || !HV.poll) return Promise.resolve();
		return rpc("condenser_api.get_account_history", [u, -1, 200, 262144, 0]).then(function (h) {
			var got = [];
			(h || []).forEach(function (x) { var o = x[1].op; if (o[0] === "custom_json" && o[1].id === "polls") { var v = HP.parseVote({ json: o[1].json, t: x[1].timestamp, auths: o[1].required_posting_auths }, HV.poll, HV.trx); if (v) got.push(v); } });
			if (got.length) { HV.ops[u] = got; HV.chk[u] = "chain"; if (HV.pending && got.some(function (v) { return v.t >= HV.pending.t - 60000; })) HV.pending = null; }
		}, function () {});
	}
	function hiveLoad() {
		if (!HV.poll || HV.loading) return Promise.resolve();
		HV.loading = true; V.lastFetch = Date.now();
		var p = HV.poll;
		var idp = HV.pid ? Promise.resolve() : jget(POLLS_API + "/polls?author=eq." + encodeURIComponent(p.author) + "&permlink=eq." + encodeURIComponent(p.permlink) + "&select=id,trx_id").then(function (r) { if (r && r[0]) { HV.pid = r[0].id; HV.trx = r[0].trx_id || ""; } });
		return idp.then(function () {
			if (!HV.pid) throw new Error("not indexed");
			return jget(POLLS_API + "/poll_votes?poll_id=eq." + HV.pid + "&select=account,choices,voted_at&order=voted_at.desc&limit=2000");
		}).then(function (rows) { HV.api = rows || []; HV.apiOk = true; }, function () { HV.apiOk = false; })
			.then(function () { return rpc("condenser_api.get_dynamic_global_properties", []).then(function (g) { HV.head = { n: g.head_block_number, t: HP.utc(g.time) }; }, function () {}); })
			.then(function () {
				var todo = HV.api.filter(function (r) { var k = r.account + "|" + r.voted_at; return HV.chk[r.account] !== k; }).slice(0, 400);
				hivePaint();
				return pool(todo, 4, function (r) {
					if (!HV.head) return Promise.reject();
					return findVote(r.account, HP.utc(r.voted_at)).then(function (hit) {
						var k = r.account + "|" + r.voted_at;
						if (hit) { var v = HP.parseVote(hit, p, HV.trx); var mine = HV.ops[r.account] || []; if (!mine.some(function (x) { return x.t === v.t; })) mine.push(v); HV.ops[r.account] = mine; HV.chk[r.account] = k; HV.src = HV.src || {}; HV.src[r.account] = "chain"; }
						else { HV.chk[r.account] = k; HV.src = HV.src || {}; HV.src[r.account] = "missing"; }
						if (Math.random() < 0.25) hivePaint();
					}, function () { HV.src = HV.src || {}; HV.src[r.account] = "node"; });
				});
			})
			.then(hiveOwn)
			.then(function () {
				if (p.ageDays > 0) {
					var need = Object.keys(HV.ops).concat(HV.api.map(function (r) { return r.account; })).filter(function (a, i, arr) { return arr.indexOf(a) === i && !HV.created[a]; });
					var batches = []; for (var i = 0; i < need.length; i += 50) batches.push(need.slice(i, i + 50));
					return pool(batches, 2, function (b) { return rpc("condenser_api.get_accounts", [b]).then(function (r) { (r || []).forEach(function (x) { HV.created[x.name] = x.created; }); }); });
				}
			})
			.then(function () { HV.loading = false; hivePaint(); }, function () { HV.loading = false; hivePaint(); });
	}
	function hiveCount() {
		var p = HV.poll, list = [], src = HV.src || {};
		Object.keys(HV.ops).forEach(function (a) { HV.ops[a].forEach(function (v) { list.push(v); }); });
		HV.api.forEach(function (r) { if (!HV.ops[r.account] && src[r.account] === "node") list.push({ a: r.account, choices: r.choices, t: HP.utc(r.voted_at) }); });
		if (HV.pending) list.push(HV.pending);
		return HP.count(p, list, HV.created);
	}
	function hivePaint() {
		var p = HV.poll; if (!p) return;
		var res = hiveCount(), u = hUser(), open = hiveOpen();
		var meV = u ? res.voters.filter(function (v) { return v.a === u; })[0] : null;
		var mine = meV ? meV.choices.map(function (c) { return c - 1; }) : null;
		var dp = { q: p.question, d: p.description, o: p.choices, m: p.max, v: res.v, open: open, closes: p.end, cl: p.end, sh: p.hide ? "voted" : "always", ch: p.changes };
		if (!p.hide || mine || !open) dp.n = res.n;
		V.poll = dp; V.skew = 0; V.mine = mine;
		var form = open && (!mine || HV.editing);
		drawPoll($("pl-poll"), dp, { mine: mine, mode: form ? "vote" : "res", busy: HV.busy, onVote: hiveVote, cancel: HV.editing ? function () { HV.editing = false; hivePaint(); } : null });
		var box = $("pl-poll");
		if (!form && open && mine && p.changes) { var cb = el("button", "tu-btn pl-change", "Change my vote"); cb.type = "button"; cb.addEventListener("click", function () { HV.editing = true; hivePaint(); }); box.appendChild(cb); }
		if (form && dp.n && !HV.editing) { var pk = el("details", "pl-peek"); pk.appendChild(el("summary", null, "See the results so far")); pk.appendChild(results(dp, null)); box.appendChild(pk); }
		if (!form && !dp.n) { /* hidden-results note already drawn */ }
		hiveExtra(res, open, mine);
		paintStatus();
		var s = $("pl-status"); s.insertBefore(el("span", "pl-chip pl-chip--hive", "Hive poll"), s.firstChild);
		var by = el("a", "pl-chip", "by @" + p.author); by.href = "https://peakd.com/@" + p.author; by.target = "_blank"; by.rel = "noopener"; s.appendChild(by);
		var note = [];
		if (open && p.changes) note.push("Votes can be changed until the end time.");
		if (open && !p.changes) note.push("Each account can vote once; changes do not count.");
		if (p.ageDays) note.push("Only accounts at least " + p.ageDays + " days old count.");
		if (p.hide && open) note.push("Results are shown after you vote.");
		$("pl-vnote").textContent = note.join(" ");
	}
	function hiveExtra(res, open, mine) {
		var x = $("pl-hextra"), p = HV.poll, u = hUser(); x.hidden = false; x.textContent = "";
		if (open) { var lb = el("div", "pl-hlogin"); loginBox(lb, mine ? "Voted as" : "Voting as"); x.appendChild(lb); }
		if (p.interp === "tokens") x.appendChild(el("p", "tu-note", "The author asked for results weighted by " + (p.token || "tokens") + ". This page counts one vote per account; PeakD shows the weighted results."));
		var src = HV.src || {}, chain = 0, nodeOnly = 0, missing = 0;
		HV.api.forEach(function (r) { var s = src[r.account]; if (s === "chain") chain++; else if (s === "missing") missing++; else if (s === "node") nodeOnly++; });
		var line = el("p", "tu-note pl-hsrc");
		if (HV.apiOk === false) line.textContent = "PeakD's open polls node (polls.hivehub.dev) is not answering, so this page cannot find everyone who voted. Shown: " + (Object.keys(HV.ops).length ? "your own vote, read from the chain." : "nothing yet.");
		else if (HV.apiOk) line.textContent = "Counted by this page from the Hive blockchain: " + chain + " of " + HV.api.length + " votes read from their blocks" + (HV.loading ? " (checking…)" : "") + "." + (nodeOnly ? " " + nodeOnly + " could not be read and are taken from PeakD's open polls node." : "") + (missing ? " " + missing + " listed by the node were not found on chain and are not counted." : "") + " Who voted comes from PeakD's open polls node.";
		else line.textContent = "Loading the votes…";
		x.appendChild(line);
		var links = el("p", "pl-hlinks");
		[["View on PeakD", "https://peakd.com/@" + p.author + "/" + p.permlink], ["Ecency", "https://ecency.com/@" + p.author + "/" + p.permlink], ["Hive.blog", "https://hive.blog/@" + p.author + "/" + p.permlink]].forEach(function (l) { var a = el("a", "tu-btn", l[0]); a.href = l[1]; a.target = "_blank"; a.rel = "noopener"; links.appendChild(a); });
		x.appendChild(links);
		if (!res.voters.length && !res.skipped.length) return;
		var d = el("details", "pl-voters"); d.appendChild(el("summary", null, "Who voted (" + res.voters.length + ")"));
		var ul = el("ul", "pl-vlist");
		res.voters.slice(0, 500).forEach(function (v) {
			var li = el("li"), a = el("a", "pl-vname", "@" + v.a); a.href = "https://peakd.com/@" + v.a; a.target = "_blank"; a.rel = "noopener";
			li.appendChild(a); li.appendChild(el("span", "pl-vch", v.choices.map(function (c) { return p.choices[c - 1]; }).join(", ")));
			var s = HV.pending && v.a === HV.pending.a && v.t === HV.pending.t ? "just sent" : src[v.a] === "node" ? "from the node" : "on chain";
			li.appendChild(el("span", "pl-vsrc pl-vsrc--" + s.replace(/ /g, ""), s + " · " + MH().timeAgo(new Date(v.t).toISOString().slice(0, 19))));
			ul.appendChild(li);
		});
		res.skipped.forEach(function (sk) { var li = el("li", "pl-vskip"); li.appendChild(el("span", "pl-vname", "@" + sk.a)); li.appendChild(el("span", "pl-vch", "not counted: " + sk.why)); ul.appendChild(li); });
		d.appendChild(ul); x.appendChild(d);
	}
	function hiveVote(picks, btn) {
		var u = hUser(), p = HV.poll;
		if (!u) { toast("Log in with Hive Keychain to vote"); var i = $("pl-hextra").querySelector("input"); if (i) i.focus(); return; }
		if (HV.busy) return; HV.busy = true; btn.disabled = true; btn.textContent = "Waiting for Keychain…";
		var choices = picks.map(function (i) { return i + 1; }), json = HP.voteJson(p, choices);
		kc(function (k, done) { k.requestCustomJson(u, "polls", "Posting", json, "Vote in the poll: " + p.question.slice(0, 80), done); }).then(function () {
			HV.busy = false; HV.editing = false; HV.pending = { a: u, choices: choices, t: Date.now() };
			toast("Vote sent to Hive"); hivePaint();
			setTimeout(function () { hiveOwn().then(hivePaint); }, 6000);
		}, function (e) { HV.busy = false; toast(e.message === "Cancelled in Keychain" ? "Vote cancelled" : "Not sent: " + e.message); hivePaint(); });
	}

	/* ---------- start ---------- */
	wireView(); wireMaker(); fillForm(); renderMine(); loadStatuses();
	var m = location.pathname.match(/^\/v\/([a-z0-9]{8})\/?$/), q = new URLSearchParams(location.search);
	var id = m ? m[1] : P.idFromText("?p=" + (q.get("p") || ""));
	var hm = location.pathname.match(/^\/hp\/([a-z0-9.-]+)\/([a-z0-9-]+)\/?$/i), href = hm ? { author: hm[1].toLowerCase(), permlink: hm[2].toLowerCase() } : q.get("h") ? HP.ref(q.get("h")) : null;
	if (href) { id = null; openHive(href); }
	var hk = location.hash.match(/(?:^#|&)k=([a-f0-9]{32})/);
	if (id && hk && !mineOf(id)) { S.mine.unshift({ id: id, key: hk[1], q: "", c: Date.now() }); save(); }
	if (hk) history.replaceState(null, "", location.pathname + location.search);
	if (id) openPoll(id).then(function () { var mm = mineOf(id); if (mm && V.poll && !mm.q) { mm.q = V.poll.q; save(); renderMine(); } });
	if (MOCK) root.insertAdjacentHTML("afterbegin", '<p class="tu-note pl-mocknote">Test mode: this copy of the page saves polls in this browser only (no server here).</p>');
})();
