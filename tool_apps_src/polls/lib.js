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
		if (o.link) lines.push("Vote here on PeakD, or on mes.fm (with Hive Keychain): " + o.link);
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
