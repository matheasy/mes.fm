/* MES Ratings -- mes.fm/ratings
 * The results of the "Rate this page" stars (main_js/rating.js): Top rated (Bayesian average), Most rated, Recently rated,
 * filtered by section (the site search's categories) and words. Data: /api/rating?top=1 (CDN-cached 5 min); titles, sections
 * and thumbnails from /search/index.json. Without the API (local preview, or an error) it shows /ratings/data/sample.json,
 * clearly labelled. Plus a general feedback box that only ever sends by the visitor's own email or the contact form.
 * State in the URL: ?v=top|most|recent&c=<category>&q=<words>.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("rt");
	if (!root) return;
	var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", '"': "&quot;", ">": "&gt;", "'": "&#39;" }[c]; }); };
	var fmt = function (n) { return Number(n).toLocaleString("en-US"); };
	var S = { v: "top", c: "", q: "" }, D = null, IDX = {}, CATS = [], SAMPLE = false, LIMIT = 100;

	(function readURL() {
		var qs = new URLSearchParams(location.search);
		if (/^(top|most|recent)$/.test(qs.get("v") || "")) S.v = qs.get("v");
		S.c = (qs.get("c") || "").slice(0, 30); S.q = (qs.get("q") || "").slice(0, 80);
	})();
	function writeURL() {
		var qs = new URLSearchParams();
		if (S.v !== "top") qs.set("v", S.v); if (S.c) qs.set("c", S.c); if (S.q) qs.set("q", S.q);
		var s = qs.toString();
		try { history.replaceState(null, "", location.pathname + (s ? "?" + s : "") + location.hash); } catch (e) { /* ignore */ }
	}

	function getJSON(u) { return fetch(u, { credentials: "omit" }).then(function (r) { if (!r.ok) throw r.status; return r.json(); }); }
	var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]sample=1\b/.test(location.search);
	var ratingsP = (local ? Promise.reject(0) : getJSON("/api/rating?top=1"))
		.catch(function () { SAMPLE = true; return getJSON("/ratings/data/sample.json"); });
	var indexP = getJSON("/search/index.json").catch(function () { return { cats: [], p: [] }; });

	Promise.all([ratingsP, indexP]).then(function (r) {
		D = r[0] || { pages: [], recent: [], min: 5 };
		CATS = (r[1].cats || []).map(function (c) { return { id: c[0], label: c[1] }; });
		(r[1].p || []).forEach(function (p) { IDX[p[0]] = { t: p[1], w: p[2], c: CATS[p[4]] ? CATS[p[4]].id : "more", img: p[5] || "" }; });
		if (D.min) $("rt-min").textContent = D.min;
		tiles(); chips(); render();
		$("rt-src").innerHTML = SAMPLE ? "<b>Sample data:</b> the live ratings could not be loaded here, so this is a made-up example of how the page looks." :
			"Live ratings, refreshed every few minutes.";
	}).catch(function () { $("rt-src").textContent = "Could not load the ratings. Please try again later."; });

	function info(p) { return IDX[p] || { t: p, w: "", c: "more", img: "" }; }
	function tiles() {
		var n = 0, s = 0, pages = D.pages.length;
		D.pages.forEach(function (x) { n += x.n; if (x.h) x.h.forEach(function (c, i) { s += c * (i + 1); }); });
		var shown = D.pages.filter(function (x) { return x.h; }), sn = shown.reduce(function (a, x) { return a + x.n; }, 0);
		var tile = function (v, l) { return '<div class="tu-stat"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + "</div></div>"; };
		$("rt-tiles").innerHTML = tile(fmt(n), "ratings") + tile(fmt(pages), "pages rated") +
			tile(sn ? (s / sn).toFixed(2) + " ★" : "–", "average (pages with " + (D.min || 5) + "+)");
	}
	function rows() {
		var list;
		if (S.v === "recent") {
			var by = {}; D.pages.forEach(function (x) { by[x.p] = x; });
			list = (D.recent || []).map(function (r) { return Object.assign({ t: r.t }, by[r.p] || { p: r.p, n: 0 }); });
		} else if (S.v === "most") list = D.pages.slice().sort(function (a, b) { return b.n - a.n || b.b - a.b; });
		else list = D.pages.filter(function (x) { return x.n >= (D.min || 5); });
		return list;
	}
	function matches(x) {
		var i = info(x.p);
		if (S.c && i.c !== S.c) return false;
		if (!S.q) return true;
		var hay = (i.t + " " + i.w + " " + x.p).toLowerCase();
		return S.q.toLowerCase().split(/\s+/).filter(Boolean).every(function (w) { return hay.indexOf(w) >= 0; });
	}
	function chips() {
		var counts = {}, all = rows(); all.forEach(function (x) { var c = info(x.p).c; counts[c] = (counts[c] || 0) + 1; });
		var h = '<button type="button" class="rt-chip" data-c="" aria-pressed="' + (!S.c) + '">All<small>' + all.length + "</small></button>";
		CATS.forEach(function (c) { if (counts[c.id]) h += '<button type="button" class="rt-chip" data-c="' + esc(c.id) + '" aria-pressed="' + (S.c === c.id) + '">' + esc(c.label) + "<small>" + counts[c.id] + "</small></button>"; });
		$("rt-chips").innerHTML = h;
	}
	function starBar(v) {
		var w = Math.max(0, Math.min(100, v / 5 * 100));
		return '<span class="rt-stars" aria-hidden="true">★★★★★<i style="width:' + w.toFixed(1) + '%">★★★★★</i></span>';
	}
	function hist(h) {
		var mx = Math.max.apply(null, h) || 1, out = '<span class="rt-hist" aria-hidden="true">';
		for (var k = 4; k >= 0; k--) out += "<span>" + (k + 1) + "★</span><span class=\"rt-hbar\"><i style=\"width:" + Math.round(h[k] / mx * 100) + '%"></i></span>';
		return out + "</span>";
	}
	function ago(t) {
		var m = Math.round((Date.now() - t) / 60000);
		if (m < 1) return "just now"; if (m < 60) return m + " min ago";
		var hh = Math.round(m / 60); if (hh < 48) return hh + " h ago";
		return Math.round(hh / 24) + " days ago";
	}
	function render() {
		var min = D.min || 5, list = rows().filter(matches), shown = list.slice(0, LIMIT);
		$("rt-list").innerHTML = shown.map(function (x, i) {
			var inf = info(x.p), th = inf.img ? '<img src="' + esc(inf.img) + '" alt="" loading="lazy" width="58" height="58">' : esc((inf.t || "?").charAt(0));
			var score;
			if (x.avg != null && x.h) score = starBar(x.avg) + '<span class="rt-num"><b>' + x.avg.toFixed(1) + "</b> <small>" + fmt(x.n) + " ratings</small></span>" + hist(x.h);
			else score = '<span class="rt-num"><b>' + fmt(x.n) + "</b> <small>" + (x.n === 1 ? "rating" : "ratings") + " (average after " + min + ")</small></span>";
			var label = x.avg != null ? x.avg.toFixed(1) + " out of 5 from " + x.n + " ratings" : x.n + " ratings";
			return '<li class="rt-row" aria-label="' + esc(inf.t + ": " + label) + '"><span class="rt-rank">' + (S.v === "recent" ? "" : (i + 1)) + '</span><span class="rt-th">' + th + "</span>" +
				'<span class="rt-main"><a class="rt-t" href="' + esc(x.p) + '">' + esc(inf.t) + '</a><span class="rt-w">' + esc(S.v === "recent" && x.t ? "Rated " + ago(x.t) + (inf.w ? " · " + inf.w : "") : (inf.w || x.p)) + "</span></span>" +
				'<span class="rt-score">' + score + "</span></li>";
		}).join("");
		var e = $("rt-empty");
		if (!list.length) {
			e.hidden = false;
			e.textContent = S.q || S.c ? "No rated pages match that filter." :
				S.v === "top" ? "No page has " + min + " ratings yet. Rate the pages you use: the stars are at the bottom of every page, just above the comments." : "No ratings yet.";
		} else if (list.length > LIMIT) { e.hidden = false; e.textContent = "Showing the first " + LIMIT + " of " + fmt(list.length) + ". Use the filter to narrow it down."; }
		else e.hidden = true;
		Array.prototype.forEach.call(document.querySelectorAll("#rt-tabs [role=tab]"), function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-v") === S.v)); });
	}

	$("rt-tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (!b || !D) return; S.v = b.getAttribute("data-v"); chips(); render(); writeURL(); });
	$("rt-tabs").addEventListener("keydown", function (e) {
		if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
		var tabs = Array.prototype.slice.call(this.querySelectorAll("[role=tab]")), i = tabs.indexOf(document.activeElement);
		if (i < 0) return; var j = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length; tabs[j].focus(); tabs[j].click();
	});
	$("rt-chips").addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (!b || !D) return; S.c = b.getAttribute("data-c"); chips(); render(); writeURL(); });
	var qt; $("rt-q").value = S.q;
	$("rt-q").addEventListener("input", function () { clearTimeout(qt); var v = this.value; qt = setTimeout(function () { S.q = v.trim().slice(0, 80); if (D) render(); writeURL(); }, 150); });

	/* general feedback: email or the contact form, prefilled; nothing stored */
	var ta = $("rt-fbta");
	function fb() {
		var text = ta.value.trim().slice(0, 1500), subj = "Feedback on mes.fm";
		$("rt-mail").href = "mailto:contact@mes.fm?subject=" + encodeURIComponent(subj) + (text ? "&body=" + encodeURIComponent(text) : "");
		$("rt-form").href = "/contact?subject=" + encodeURIComponent(subj) + (text ? "&message=" + encodeURIComponent(text) : "");
	}
	ta.addEventListener("input", fb);
	try { var d = localStorage.getItem("mes-ratings:draft"); if (d) { ta.value = d; fb(); } ta.addEventListener("input", function () { try { localStorage.setItem("mes-ratings:draft", ta.value.slice(0, 1500)); } catch (e) { /* ignore */ } }); } catch (e) { /* ignore */ }
})();
