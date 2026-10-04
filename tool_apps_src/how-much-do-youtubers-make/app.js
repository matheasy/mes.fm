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
