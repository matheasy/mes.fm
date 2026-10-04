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

/* MES "How much do YouTubers make?" -- mes.fm/how-much-do-youtubers-make
 * A leaderboard of big channels with ESTIMATED ad revenue. Data: data/channels.json (dated snapshot written by update_youtuber_snapshot.py), optionally
 * refreshed live from /api/youtuber-stats (needs YOUTUBE_API_KEY on the server; 503 until then). Maths: lib.js (MESYT), which copies the RPM tables of
 * mes.fm/youtubemoney. State is in the query string (?q=&t=&sort=&dir=&geo=&sh=) so a view can be shared. Ad-free page; no third-party requests.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("hm");
	if (!root) return;
	var Y = window.MESYT, SNAP = "/how-much-do-youtubers-make/data/channels.json";
	var doc = null, st = Y.parseQuery(location.search), expanded = {};

	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function hue(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; }
	function badge(c) { var ini = (c.name.replace(/[^\p{L}\p{N}]/gu, "").charAt(0) || "?").toUpperCase(); return '<span class="hm-badge" style="background:hsl(' + hue(c.name) + ',50%,38%)" aria-hidden="true">' + esc(ini) + "</span>"; }
	function topicName(k) { return (Y.BYTOPIC[k] || Y.BYTOPIC.mix)[1]; }
	function opt() { return { geo: st.geo || null, shorts: parseInt(st.sh, 10) / 100 }; }
	function range(e, k) { return e ? '<span class="hm-mid">' + Y.money(e[k].mid) + '</span><span class="hm-range">' + Y.money(e[k].lo) + " &ndash; " + Y.money(e[k].hi) + "</span>" : '<span class="hm-range">n/a</span>'; }
	function chLink(c) { return '<a class="hm-handle" href="https://www.youtube.com/@' + encodeURIComponent(c.handle) + '" target="_blank" rel="noopener">@' + esc(c.handle) + "</a>"; }

	function detail(r) {
		var c = r.ch, e = r.est, rc = c.recent, h = "<dl>";
		h += "<dt>Recent uploads sampled</dt><dd>" + (rc.medianViews == null ? "none" : rc.videosSampled + " long-form videos, median " + Y.compact(rc.medianViews) + " views") + "</dd>";
		h += "<dt>Uploads per month</dt><dd>" + (rc.uploadsPerMonth == null ? "n/a" : rc.uploadsPerMonth) + "</dd>";
		if (e) {
			h += "<dt>RPM used (per 1,000 views)</dt><dd>$" + e.rpm.lo.toFixed(2) + " &ndash; $" + e.rpm.hi.toFixed(2) + ", typical $" + e.rpm.mid.toFixed(2) + "</dd>";
			h += "<dt>Audience assumed</dt><dd>" + (st.geo ? "Everyone: " + esc(Y.GEO_NAMES[st.geo]) : esc(c.country || "n/a") + " (" + esc(Y.GEO_NAMES[e.geo]) + ", &times;" + esc(e.geo) + ")") + "</dd>";
		}
		h += "<dt>Topic</dt><dd>" + esc(topicName(c.topic)) + "</dd>";
		if (c.totalViews != null) h += "<dt>Lifetime views</dt><dd>" + Y.compact(c.totalViews) + (c.videoCount != null ? " over " + Y.compact(c.videoCount) + " videos" : "") + "</dd>";
		if (e && e.lifetime) h += "<dt>Cross-check from lifetime views</dt><dd>about " + Y.money(e.lifetime.perYear) + " a year over the channel's " + e.lifetime.years.toFixed(1) + " years at the typical RPM (all views, including old videos and Shorts at the long-form rate)</dd>";
		else h += "<dt>Lifetime views</dt><dd>not in this snapshot</dd>";
		return h + "</dl>";
	}
	function actions(r) {
		return '<a class="tu-btn" href="' + esc(Y.calcLink(r.ch, r.est)) + '">Calculate this channel</a>';
	}

	function render() {
		if (!doc) return;
		var all = Y.decorate(doc.channels, opt());
		var rows = Y.sortRows(Y.filterRows(all, st.t, st.q), st.sort, st.dir);
		$("hm-count").textContent = rows.length === all.length ? "Showing all " + all.length + " channels" : "Showing " + rows.length + " of " + all.length + " channels";
		var cols = [["rank", "#", ""], ["name", "Channel", "hm-ch"], ["topic", "Topic", "hm-topic"], ["subs", "Subscribers", ""], ["views", "Est. monthly views", ""], ["month", "Est. per month", ""], ["year", "Est. per year", ""]];
		var asc = st.dir === "asc";
		var th = cols.map(function (c) {
			if (c[0] === "rank") return '<th class="hm-rank" scope="col">#</th>';
			var active = st.sort === c[0];
			return '<th scope="col" class="' + c[2] + '" aria-sort="' + (active ? (asc ? "ascending" : "descending") : "none") + '"><button type="button" data-sort="' + c[0] + '">' + c[1] + "</button></th>";
		}).join("") + '<th scope="col"></th>';
		var body = rows.map(function (r) {
			var c = r.ch, open = expanded[c.id];
			return '<tr data-id="' + c.id + '"><td class="hm-rank">' + r.rank + '</td><td class="hm-ch"><div class="hm-chwrap">' + badge(c) + '<div><div class="hm-name">' + esc(c.name) + "</div>" + chLink(c) + '</div></div></td>' +
				'<td class="hm-topic"><span class="hm-pill">' + esc(topicName(c.topic)) + "</span></td><td>" + Y.compact(c.subscribers) + "</td><td>" + (r.est ? Y.compact(r.est.views) : "n/a") + "</td><td>" + range(r.est, "month") + "</td><td>" + range(r.est, "year") + "</td>" +
				'<td class="hm-act"><button type="button" class="tu-btn tu-btn--ghost" data-detail="' + c.id + '" aria-expanded="' + !!open + '">' + (open ? "Hide" : "Details") + "</button> " + actions(r) + "</td></tr>" +
				(open ? '<tr class="hm-detail"><td colspan="8">' + detail(r) + "</td></tr>" : "");
		}).join("");
		$("hm-table").innerHTML = "<thead><tr>" + th + "</tr></thead><tbody>" + (body || '<tr><td colspan="8" class="hm-empty">No channels match. Try another word or topic.</td></tr>') + "</tbody>";
		$("hm-cards").innerHTML = rows.length ? rows.map(function (r) {
			var c = r.ch;
			return '<div class="hm-card"><div class="hm-card__top">' + badge(c) + '<div><div class="hm-name">' + esc(c.name) + "</div>" + chLink(c) + '</div><span class="hm-card__rank">#' + r.rank + "</span></div>" +
				'<div class="hm-card__grid"><div><div class="hm-card__k">Topic</div><span class="hm-pill">' + esc(topicName(c.topic)) + '</span></div><div><div class="hm-card__k">Subscribers</div>' + Y.compact(c.subscribers) + "</div>" +
				'<div><div class="hm-card__k">Est. per month</div>' + range(r.est, "month") + '</div><div><div class="hm-card__k">Est. per year</div>' + range(r.est, "year") + "</div></div>" +
				'<details><summary>Details</summary>' + detail(r) + "</details>" + actions(r) + "</div>";
		}).join("") : '<div class="hm-empty">No channels match. Try another word or topic.</div>';
		try { history.replaceState(null, "", location.pathname + Y.buildQuery(st)); } catch (e) {}
	}

	function topics() {
		var seen = {}, n = {};
		doc.channels.forEach(function (c) { n[c.topic] = (n[c.topic] || 0) + 1; });
		var list = Y.NICHES.filter(function (x) { return n[x[0]]; });
		$("hm-topics").innerHTML = '<button type="button" class="tu-chip" data-t="" aria-pressed="' + !st.t + '">All topics (' + doc.channels.length + ")</button>" + list.map(function (x) {
			return '<button type="button" class="tu-chip" data-t="' + x[0] + '" aria-pressed="' + (st.t === x[0]) + '">' + esc(x[1]) + " (" + n[x[0]] + ")</button>";
		}).join("");
	}
	function syncControls() {
		$("hm-q").value = st.q; $("hm-geo").value = st.geo; $("hm-sh").value = st.sh; $("hm-sort").value = st.sort + ":" + st.dir;
		if (!$("hm-sort").value) $("hm-sort").value = "";
		Array.prototype.forEach.call($("hm-topics").children, function (b) { b.setAttribute("aria-pressed", String((b.getAttribute("data-t") || "") === st.t)); });
	}
	function status(live) {
		var el = $("hm-status"), src = doc.source === "youtube-data-api" ? "YouTube Data API" : doc.source === "yt-dlp" ? "YouTube public channel pages" : doc.source;
		el.className = "hm-status";
		el.textContent = "Data " + (live ? "refreshed " : "updated ") + doc.generated + " · source: " + src + ". " + (doc.method || "");
		$("hm-n").textContent = String(doc.channels.length);
	}
	function use(d, live) { doc = d; status(live); topics(); syncControls(); render(); }

	function load() {
		fetch(SNAP, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); }).then(function (d) {
			var bad = Y.validate(d);
			if (bad.length) throw new Error(bad[0]);
			use(d, false);
		}).catch(function () { var el = $("hm-status"); el.className = "hm-status is-warn"; el.textContent = "The channel data could not be loaded. Please reload the page."; });
	}
	function refresh() {
		var btn = $("hm-refresh"), el = $("hm-status");
		btn.disabled = true; btn.textContent = "Refreshing…";
		var done = function () { btn.disabled = false; btn.textContent = "Refresh live numbers"; };
		var warn = function (m) { el.className = "hm-status is-warn"; el.textContent = m + " Showing the saved snapshot from " + doc.generated + "."; };
		fetch("/api/youtuber-stats", { headers: { Accept: "application/json" } }).then(function (r) {
			if (r.status === 503 || r.status === 404) throw new Error("off");   // 503 = no key on the server; 404 = function not deployed (local preview)
			if (!r.ok) throw new Error("http");
			return r.json();
		}).then(function (d) {
			if (Y.validate(d).length) throw new Error("bad");
			use(d, true);
		}).catch(function (e) {
			warn(e && e.message === "off" ? "Live refresh is not set up yet." : "Live numbers could not be loaded just now.");
		}).then(done, done);
	}

	function bind() {
		var qt;
		$("hm-q").addEventListener("input", function () { st.q = this.value; clearTimeout(qt); qt = setTimeout(render, 120); });
		$("hm-geo").addEventListener("change", function () { st.geo = this.value; render(); });
		$("hm-sh").addEventListener("change", function () { st.sh = this.value; render(); });
		$("hm-sort").addEventListener("change", function () { var p = this.value.split(":"); st.sort = p[0]; st.dir = p[1]; render(); });
		$("hm-topics").addEventListener("click", function (e) { var b = e.target.closest("[data-t]"); if (!b) return; st.t = b.getAttribute("data-t"); syncControls(); render(); });
		$("hm-table").addEventListener("click", function (e) {
			var s = e.target.closest("[data-sort]"), d = e.target.closest("[data-detail]");
			if (s) {
				var k = s.getAttribute("data-sort");
				if (st.sort === k) st.dir = st.dir === "asc" ? "desc" : "asc"; else { st.sort = k; st.dir = (k === "name" || k === "topic") ? "asc" : "desc"; }
				syncControls(); render();
			} else if (d) { var id = d.getAttribute("data-detail"); expanded[id] = !expanded[id]; render(); }
		});
		$("hm-reset").addEventListener("click", function () { st = Y.parseQuery(""); expanded = {}; syncControls(); render(); });
		$("hm-refresh").addEventListener("click", refresh);
		$("hm-csv").addEventListener("click", function () {
			if (!doc) return;
			var rows = Y.sortRows(Y.filterRows(Y.decorate(doc.channels, opt()), st.t, st.q), st.sort, st.dir);
			var blob = new Blob([Y.toCsv(rows, doc.generated)], { type: "text/csv;charset=utf-8" }), a = document.createElement("a");
			a.href = URL.createObjectURL(blob); a.download = "youtuber-earnings-estimates-" + doc.generated + ".csv";
			document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
		});
	}
	bind(); syncControls(); load();
})();
