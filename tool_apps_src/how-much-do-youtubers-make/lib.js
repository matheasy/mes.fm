/* MES "How much do YouTubers make?" -- pure maths (no DOM; node-testable via require, tool_apps_src/how-much-do-youtubers-make-tests.js). Exposed as window.MESYT.
 *
 * The RPM numbers below are COPIED from the calculator at mes.fm/youtubemoney (tool_apps_src/youtubemoney/app.js: NICHES, SHORTS, GEO_NAMES):
 * keep them in step with it. RPM = creator revenue per 1,000 views after YouTube's cut, in USD.
 *
 * Estimate for one channel (ad revenue only, new long-form uploads only):
 *   monthly views = median views of the recent long-form uploads x uploads per month
 *   RPM           = topic RPM (low / typical / high) x audience-location factor, blended with the Shorts RPM for the Shorts share
 *   earnings      = views x RPM / 1000; yearly = monthly x 12
 */
(function (root) {
	"use strict";
	// [id, name, low, typical, high] -- same table as youtubemoney/app.js
	var NICHES = [
		["mix", "Not sure / typical channel", 1.0, 2.5, 5.0],
		["entertainment", "Entertainment & vlogs", 1.0, 2.0, 3.5],
		["gaming", "Gaming", 0.8, 1.6, 3.0],
		["music", "Music", 0.5, 1.2, 2.5],
		["comedy", "Comedy & memes", 1.0, 2.0, 3.5],
		["kids", "Kids & family", 0.5, 1.2, 2.5],
		["sports", "Sports", 1.5, 2.8, 4.5],
		["news", "News & politics", 2.0, 3.5, 6.0],
		["beauty", "Beauty & fashion", 2.0, 3.5, 6.0],
		["food", "Food & cooking", 2.0, 3.5, 6.0],
		["travel", "Travel & lifestyle", 2.0, 3.5, 6.0],
		["education", "Education, science & math", 3.0, 4.5, 8.0],
		["health", "Health & fitness", 3.0, 5.0, 9.0],
		["tech", "Tech & reviews", 4.0, 6.0, 12.0],
		["business", "Business & marketing", 6.0, 10.0, 18.0],
		["finance", "Personal finance & investing", 8.0, 14.0, 30.0]
	];
	var SHORTS = [0.01, 0.035, 0.07];
	var GEO_NAMES = { "1": "high-income countries", "0.7": "a mix of regions", "0.35": "Asia, Africa and Latin America" };
	var BYTOPIC = {};
	NICHES.forEach(function (n) { BYTOPIC[n[0]] = n; });

	var SAMPLE = 15, MIN_AGE_DAYS = 7, RATE_WINDOW_DAYS = 90, DAY = 86400;

	function median(a) {
		if (!a.length) return null;
		var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1;
		return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
	}
	/* vids = [{ts (unix seconds), views}] long-form only. Same rule as update_youtuber_snapshot.py recent_summary() and api/youtuber-stats.js. */
	function recentSummary(vids, now) {
		now = now == null ? Date.now() / 1000 : now;
		var sorted = vids.slice().sort(function (a, b) { return b.ts - a.ts; });
		var old = sorted.filter(function (v) { return v.views != null && now - v.ts >= MIN_AGE_DAYS * DAY; }).slice(0, SAMPLE);
		var med = old.length ? Math.round(median(old.map(function (v) { return v.views; }))) : null;
		var ts = sorted.map(function (v) { return v.ts; }).reverse(), rate = null;
		if (ts.length >= 2) {
			var cutoff = now - RATE_WINDOW_DAYS * DAY, n90 = ts.filter(function (t) { return t >= cutoff; }).length;
			if (n90 >= 3 && ts[0] < cutoff) rate = n90 / (RATE_WINDOW_DAYS / 30.4375);
			else rate = (ts.length - 1) / Math.max((ts[ts.length - 1] - ts[0]) / DAY, 1) * 30.4375;
		}
		return { videosSampled: old.length, medianViews: med, uploadsPerMonth: rate == null ? null : Math.round(rate * 10) / 10, shortsShare: null, windowDays: RATE_WINDOW_DAYS };
	}

	/* RPM range for a topic: long-form x geo, blended with Shorts by `shorts` (0..1 = share of the estimated views that are Shorts). */
	function rpmRange(topic, geo, shorts) {
		var n = BYTOPIC[topic] || BYTOPIC.mix, g = parseFloat(geo) || 1, s = Math.min(1, Math.max(0, +shorts || 0));
		var lo = [n[2], n[3], n[4]];
		return { lo: ((1 - s) * lo[0] + s * SHORTS[0]) * g, mid: ((1 - s) * lo[1] + s * SHORTS[1]) * g, hi: ((1 - s) * lo[2] + s * SHORTS[2]) * g };
	}
	/* opt = { geo: null (the channel's own assumed audience) | "1" | "0.7" | "0.35", shorts: 0..1 }. null when the channel has no recent-views data. */
	function estimate(ch, opt) {
		opt = opt || {};
		var r = ch.recent || {};
		if (r.medianViews == null || r.uploadsPerMonth == null) return null;
		var geo = opt.geo || ch.geo || "1", rpm = rpmRange(ch.topic, geo, opt.shorts);
		var views = r.medianViews * r.uploadsPerMonth;
		var month = { lo: views * rpm.lo / 1000, mid: views * rpm.mid / 1000, hi: views * rpm.hi / 1000 };
		var out = { views: views, geo: String(geo), rpm: rpm, month: month, year: { lo: month.lo * 12, mid: month.mid * 12, hi: month.hi * 12 } };
		if (ch.totalViews != null && ch.publishedAt) {   // secondary cross-check from lifetime views (API data only)
			var years = Math.max((Date.now() - Date.parse(ch.publishedAt)) / (365.25 * DAY * 1000), 0.25);
			out.lifetime = { total: ch.totalViews * rpm.mid / 1000, perYear: ch.totalViews * rpm.mid / 1000 / years, years: years };
		}
		return out;
	}

	function money(n) {
		if (n == null || !isFinite(n)) return "n/a";
		var a = Math.abs(n);
		if (a < 1000) return "$" + Math.round(n).toLocaleString("en-US");
		var u = a < 1e6 ? [1e3, "K"] : a < 1e9 ? [1e6, "M"] : [1e9, "B"], v = n / u[0];
		return "$" + (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + u[1];
	}
	function compact(n) {
		if (n == null || !isFinite(n)) return "n/a";
		var a = Math.abs(n);
		if (a < 1000) return String(Math.round(n));
		var u = a < 1e6 ? [1e3, "K"] : a < 1e9 ? [1e6, "M"] : [1e9, "B"], v = n / u[0];
		return (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10) + u[1];
	}

	/* rows = channels with a `rank` (position by subscribers) added by decorate(). */
	function decorate(channels, opt) {
		var byS = channels.slice().sort(function (a, b) { return (b.subscribers || 0) - (a.subscribers || 0); });
		var rank = {};
		byS.forEach(function (c, i) { rank[c.id] = i + 1; });
		return channels.map(function (c) { return { ch: c, rank: rank[c.id], est: estimate(c, opt) }; });
	}
	var SORTS = {
		rank: function (r) { return r.rank; },
		name: function (r) { return r.ch.name.toLowerCase(); },
		topic: function (r) { return (BYTOPIC[r.ch.topic] || BYTOPIC.mix)[1].toLowerCase(); },
		subs: function (r) { return r.ch.subscribers; },
		views: function (r) { return r.est && r.est.views; },
		month: function (r) { return r.est && r.est.month.mid; },
		year: function (r) { return r.est && r.est.year.mid; }
	};
	function sortRows(rows, key, dir) {
		var f = SORTS[key] || SORTS.rank, d = dir === "desc" ? -1 : 1;
		return rows.slice().sort(function (a, b) {
			var x = f(a), y = f(b);
			if (x == null && y == null) return a.rank - b.rank;
			if (x == null) return 1;   // no estimate sorts last either way
			if (y == null) return -1;
			return (x < y ? -1 : x > y ? 1 : a.rank - b.rank) * d;
		});
	}
	function filterRows(rows, topic, q) {
		var words = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
		return rows.filter(function (r) {
			if (topic && r.ch.topic !== topic) return false;
			var hay = (r.ch.name + " " + r.ch.handle + " " + (BYTOPIC[r.ch.topic] || BYTOPIC.mix)[1] + " " + (r.ch.country || "")).toLowerCase();
			return words.every(function (w) { return hay.indexOf(w) >= 0; });
		});
	}
	function csvCell(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
	function toCsv(rows, date) {
		var head = ["rank", "channel", "handle", "topic", "subscribers", "median_recent_views", "uploads_per_month", "est_monthly_views", "month_low_usd", "month_typical_usd", "month_high_usd", "year_low_usd", "year_typical_usd", "year_high_usd", "audience_geo_factor_assumed", "data_date"];
		var out = [head.join(",")];
		rows.forEach(function (r) {
			var e = r.est, c = r.ch, rd = function (x) { return x == null ? "" : Math.round(x); };
			out.push([r.rank, c.name, "@" + c.handle, (BYTOPIC[c.topic] || BYTOPIC.mix)[1], c.subscribers, c.recent.medianViews, c.recent.uploadsPerMonth,
				e ? rd(e.views) : "", e ? rd(e.month.lo) : "", e ? rd(e.month.mid) : "", e ? rd(e.month.hi) : "", e ? rd(e.year.lo) : "", e ? rd(e.year.mid) : "", e ? rd(e.year.hi) : "",
				e ? e.geo : "", date || ""].map(csvCell).join(","));
		});
		return out.join("\n") + "\n";
	}
	/* Deep link into the calculator (youtubemoney's own share-query names: mode, f, v, per, n, geo). */
	function calcLink(ch, est, opt) {
		if (!est) return "/youtubemoney";
		var p = ["mode=earn", "f=long", "v=" + Math.round(est.views), "per=month", "n=" + encodeURIComponent(ch.topic), "geo=" + encodeURIComponent(est.geo)];
		return "/youtubemoney?" + p.join("&");
	}
	var DEFS = { q: "", t: "", sort: "subs", dir: "desc", geo: "", sh: "0" };
	function parseQuery(search) {
		var out = {}, k, p = new URLSearchParams(search || "");
		for (k in DEFS) out[k] = p.has(k) ? p.get(k) : DEFS[k];
		if (!SORTS[out.sort]) out.sort = "subs";
		if (out.dir !== "asc") out.dir = "desc";
		if (out.t && !BYTOPIC[out.t]) out.t = "";
		if (out.geo && !GEO_NAMES[out.geo]) out.geo = "";
		if (["0", "10", "25", "50", "75"].indexOf(out.sh) < 0) out.sh = "0";
		return out;
	}
	function buildQuery(st) {
		var p = [];
		for (var k in DEFS) if (st[k] != null && String(st[k]) !== DEFS[k]) p.push(k + "=" + encodeURIComponent(st[k]));
		return p.length ? "?" + p.join("&") : "";
	}
	/* Schema check for channels.json and for the /api/youtuber-stats answer. Returns a list of problems (empty = valid). */
	function validate(doc) {
		var bad = [];
		if (!doc || !Array.isArray(doc.channels) || !doc.channels.length) return ["no channels"];
		if (!/^\d{4}-\d{2}-\d{2}/.test(doc.generated || "")) bad.push("generated date missing");
		if (!doc.source) bad.push("source missing");
		var ids = {}, handles = {};
		doc.channels.forEach(function (c, i) {
			var w = "channel " + i + " (" + (c && c.handle) + "): ";
			if (!c || typeof c !== "object") { bad.push(w + "not an object"); return; }
			if (!/^UC[\w-]{22}$/.test(c.id || "")) bad.push(w + "bad id");
			if (ids[c.id]) bad.push(w + "duplicate id"); ids[c.id] = 1;
			if (!c.handle || handles[c.handle.toLowerCase()]) bad.push(w + "missing or duplicate handle"); handles[(c.handle || "").toLowerCase()] = 1;
			if (!c.name) bad.push(w + "no name");
			if (!BYTOPIC[c.topic]) bad.push(w + "unknown topic " + c.topic);
			if (!GEO_NAMES[c.geo]) bad.push(w + "bad geo " + c.geo);
			if (!(c.subscribers > 0)) bad.push(w + "no subscribers");
			if (!c.recent || typeof c.recent !== "object") bad.push(w + "no recent block");
			else ["medianViews", "uploadsPerMonth"].forEach(function (k) { if (c.recent[k] != null && !(c.recent[k] >= 0)) bad.push(w + "recent." + k + " invalid"); });
		});
		return bad;
	}
	var api = { NICHES: NICHES, SHORTS: SHORTS, GEO_NAMES: GEO_NAMES, BYTOPIC: BYTOPIC, SAMPLE: SAMPLE, median: median, recentSummary: recentSummary, rpmRange: rpmRange, estimate: estimate,
		money: money, compact: compact, decorate: decorate, sortRows: sortRows, filterRows: filterRows, toCsv: toCsv, calcLink: calcLink, parseQuery: parseQuery, buildQuery: buildQuery, validate: validate };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESYT = api;
})(typeof window !== "undefined" ? window : globalThis);
