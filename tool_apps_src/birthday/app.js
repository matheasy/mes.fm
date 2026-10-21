/* MES Famous Birthdays -- mes.fm/birthday (UI). Helpers + loader in lib.js (global BD); Sun sign / Chinese animal from the zodiac page's lib (global ZD,
 * on Astronomy Engine). Links: ?d=10-26 | ?d=1980-10-26, &q= (name filter), &f= field, &c= country, &e= era, &a=1 living, &s= sort. Nothing is stored or sent. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("bd");
	if (!root || !window.BD) return;
	var L = BD.loader("/birthday/data/"), PAGE = 30;
	var now = new Date(), TODAY = { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() };
	var S = { mo: TODAY.mo, d: TODAY.d, y: null, field: "", country: "", era: "", alive: false, sort: "fame", shown: PAGE, hl: "" };
	var DAY = [];          // people of the current day
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function toast(msg) { var t = $("bd-toast"); if (!t) { t = document.createElement("div"); t.id = "bd-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	var hasAstro = function () { return !!(window.ZD && window.Astronomy); };
	// Sun sign for a known date (noon UTC; both signs on a change day) + Chinese animal
	var SIGNC = {};
	function signs(p) {
		var k = p.y + "-" + p.mo + "-" + p.d; if (SIGNC[k]) return SIGNC[k];
		var r = {};
		if (hasAstro()) {
			try {
				var a = ZD.signOf(ZD.lonOf("sun", new Date(Date.UTC(p.y, p.mo - 1, p.d) - 14 * 3600000))).sign, b = ZD.signOf(ZD.lonOf("sun", new Date(Date.UTC(p.y, p.mo - 1, p.d + 1) + 12 * 3600000))).sign;
				r.sun = a; r.sun2 = a.i !== b.i ? b : null; r.cn = ZD.chinese(p.y, p.mo, p.d);
			} catch (e) {}
		}
		if (!r.sun && window.ZD) r.sun = ZD.sunSignByDay(p.mo, p.d);
		return (SIGNC[k] = r);
	}
	function signHtml(p) {
		var s = signs(p), h = "";
		if (s.sun) h += '<span class="bd-sign" title="Sun sign' + (s.sun2 ? ": the Sun changed sign that day" : "") + '">' + s.sun.glyph + " " + s.sun.name + (s.sun2 ? " / " + s.sun2.name : "") + "</span>";
		if (s.cn) h += '<span class="bd-sign" title="Chinese zodiac (year from Lunar New Year)">' + s.cn.emoji + " " + s.cn.element + " " + s.cn.animal + "</span>";
		return h;
	}
	function zodiacUrl(p, extra) { return "/zodiac?d=" + BD.iso(p) + (extra || ""); }
	function card(p) {
		var url = p.link || BD.wikiUrl(p), cmp = "/zodiac?p=" + encodeURIComponent(p.id) + (S.y ? "&d=" + BD.iso({ y: S.y, mo: S.mo, d: S.d }) : "");
		return '<div class="bd-p' + (p.id === S.hl ? " bd-hl" : "") + '" id="p-' + esc(p.id) + '">' +
			'<div class="bd-main"><div class="bd-top"><a class="bd-name" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(p.name) + "</a>" +
			'<span class="bd-life">' + esc(BD.lifeText(p, TODAY)) + "</span></div>" +
			(p.desc ? '<div class="bd-desc">' + esc(p.desc) + "</div>" : "") +
			'<div class="bd-meta"><span class="bd-tag bd-f-' + esc(p.field) + '">' + esc(BD.FIELDS[p.field] || "Other") + "</span>" +
			(p.country ? '<span class="bd-ctry">' + esc(p.country) + "</span>" : "") + signHtml(p) +
			'<a class="bd-cmp" href="' + esc(cmp) + '">' + (S.y ? "Compare signs with yours" : "Compare signs") + "</a>" +
			(p.os ? '<span class="bd-os" title="Born when the old Julian calendar was used there: the date is shown in today&rsquo;s calendar">modern-calendar date</span>' : "") +
			"</div></div></div>";
	}
	function mini(p, label) {
		return '<button type="button" class="bd-mini" data-go="' + esc(p.dob) + '" data-id="' + esc(p.id) + '"><span class="bd-mini-n">' + esc(p.name) + '</span><span class="bd-mini-d">' + esc(label || BD.dobText(p.dob)) + "</span></button>";
	}

	/* ---------- day picker ---------- */
	function fillPickers() {
		$("bd-month").innerHTML = BD.MONTHS.map(function (m, i) { return '<option value="' + (i + 1) + '">' + m + "</option>"; }).join("");
		fillDays();
	}
	function fillDays() {
		var n = new Date(Date.UTC(2000, S.mo, 0)).getUTCDate(), h = "";
		for (var d = 1; d <= n; d++) h += '<option value="' + d + '">' + d + "</option>";
		$("bd-day").innerHTML = h; $("bd-month").value = S.mo; $("bd-day").value = Math.min(S.d, n);
	}
	function setDay(mo, d, y, keepFilters) {
		S.mo = mo; S.d = d; S.y = y || null; S.shown = PAGE;
		if (!keepFilters) { S.field = ""; S.country = ""; S.era = ""; }
		fillDays(); load();
	}

	/* ---------- render ---------- */
	function filtered() { return BD.sortBy(BD.filter(DAY, { field: S.field, country: S.country, era: S.era, alive: S.alive }, TODAY), S.sort); }
	function renderFilters() {
		var base = BD.filter(DAY, { country: S.country, era: S.era, alive: S.alive }, TODAY), fc = BD.counts(base, "field");
		var h = '<button type="button" class="tu-chip" data-f="" aria-pressed="' + (!S.field) + '">All ' + base.length + "</button>";
		Object.keys(BD.FIELDS).forEach(function (k) { if (fc[k] || S.field === k) h += '<button type="button" class="tu-chip" data-f="' + k + '" aria-pressed="' + (S.field === k) + '">' + esc(BD.FIELDS[k]) + " " + (fc[k] || 0) + "</button>"; });
		$("bd-fields").innerHTML = h;
		var cc = BD.counts(BD.filter(DAY, { field: S.field, era: S.era, alive: S.alive }, TODAY), "country"), keys = Object.keys(cc).sort(function (a, b) { return cc[b] - cc[a] || a.localeCompare(b); });
		if (S.country && keys.indexOf(S.country) < 0) keys.unshift(S.country);
		$("bd-country").innerHTML = '<option value="">Every country</option>' + keys.map(function (k) { return '<option value="' + esc(k) + '">' + esc(k) + " (" + (cc[k] || 0) + ")</option>"; }).join("");
		$("bd-country").value = S.country;
		var ec = BD.counts(BD.filter(DAY, { field: S.field, country: S.country, alive: S.alive }, TODAY), "era");
		$("bd-era").innerHTML = '<option value="">Any year</option>' + BD.ERAS.map(function (e) { return '<option value="' + e[0] + '">' + e[1] + " (" + (ec[e[0]] || 0) + ")</option>"; }).join("");
		$("bd-era").value = S.era; $("bd-sort").value = S.sort; $("bd-alive").checked = S.alive;
	}
	function render() {
		var isToday = S.mo === TODAY.mo && S.d === TODAY.d;
		$("bd-title").textContent = (isToday ? "Born today, " : "Born on ") + BD.dateText(S.mo, S.d);
		var sg = window.ZD ? ZD.sunSignByDay(S.mo, S.d) : null;
		$("bd-sub").textContent = DAY.length + " famous people" + (sg ? " · usually " + sg.glyph + " " + sg.name : "");
		renderFilters();
		var list = filtered();
		if (S.hl) { var at = -1; list.forEach(function (p, i) { if (p.id === S.hl) at = i; }); if (at >= S.shown) S.shown = at + 1; }
		$("bd-list").innerHTML = list.length ? list.slice(0, S.shown).map(card).join("") : '<p class="bd-empty">Nobody matches these filters on this day.</p>';
		$("bd-moreb").hidden = list.length <= S.shown;
		$("bd-moreb").textContent = "Show more (" + (list.length - S.shown) + " left)";
		$("bd-zlink").href = "/zodiac?d=" + (S.y ? S.y + "-" : "") + BD.pad(S.mo) + "-" + BD.pad(S.d);
		$("bd-zlink").textContent = S.y ? "Your birth chart" : "Zodiac sign for this date";
		renderYou(); renderExtra();
		history.replaceState(null, "", location.pathname + (function () { var q = BD.toQuery({ mo: S.mo, d: S.d, y: S.y, field: S.field, country: S.country, era: S.era, alive: S.alive, sort: S.sort }); return q && !(isToday && !S.y && q === BD.toQuery({ mo: S.mo, d: S.d })) ? "?" + q : ""; })());
		if (S.hl) { var el = $("p-" + S.hl); if (el) el.scrollIntoView({ block: "center", behavior: "smooth" }); }
	}
	function renderYou() {
		var box = $("bd-you");
		if (!S.y) { box.hidden = true; box.innerHTML = ""; return; }
		var me = { y: S.y, mo: S.mo, d: S.d }, s = signs(me), same = DAY.filter(function (p) { return p.y === S.y; });
		var age = BD.ageOn(S.y, S.mo, S.d, TODAY), h = '<div class="tu-card bd-youc"><h3>You: ' + esc(BD.dateText(S.mo, S.d, S.y)) + (age >= 0 && age < 130 ? " <span class=\"bd-age\">(age " + age + ")</span>" : "") + "</h3>";
		h += '<p class="bd-yousigns">' + (s.sun ? "<strong>" + s.sun.glyph + " " + s.sun.name + (s.sun2 ? " or " + s.sun2.name : "") + "</strong> Sun sign" + (s.sun2 ? " (the Sun changed sign that day: your birth time decides)" : "") : "") +
			(s.cn ? " · <strong>" + s.cn.emoji + " " + s.cn.element + " " + s.cn.animal + "</strong> in the Chinese zodiac" : "") + ' · <a href="' + esc(zodiacUrl(me)) + '">Your full birth chart</a></p>';
		h += same.length ? '<p class="bd-youline">Born on <strong>exactly the same date</strong>: ' + same.map(function (p) { return '<a href="' + esc(p.link || BD.wikiUrl(p)) + '" target="_blank" rel="noopener">' + esc(p.name) + "</a>"; }).join(", ") + "</p>"
			: '<p class="bd-youline">Nobody in the list was born on exactly the same date (' + esc(BD.dateText(S.mo, S.d, S.y)) + ").</p>";
		box.innerHTML = h + "</div>"; box.hidden = false;
	}
	function renderExtra() {
		var box = $("bd-extra"), want = S.mo + "-" + S.d + "-" + (S.y || ""), near = [-2, -1, 1, 2].map(function (n) { var t = BD.shift(S.mo, S.d, n); t.gap = Math.abs(n); return t; });
		box.dataset.want = want;
		// the name index (~160 KB gzipped) is only needed for "same year"; nearby days come from the month files
		Promise.all([S.y ? L.index() : Promise.resolve(null), Promise.all(near.map(function (t) { return L.day(t.mo, t.d).then(function (l) { return l.map(function (p) { p.gap = t.gap; return p; }); }); }))]).then(function (r) {
			if (box.dataset.want !== want) return;
			var h = "", idx = r[0];
			if (S.y && idx) {
				var sy = BD.sameYear(idx, S.y, S.mo, S.d, 16).filter(function (p) { return !(p.mo === S.mo && p.d === S.d); }).slice(0, 12);
				if (sy.length) h += '<div class="tu-card"><h3>Also born in ' + S.y + ", closest to your birthday</h3><div class=\"bd-minis\">" + sy.map(function (p) { return mini(p, BD.dateText(p.mo, p.d) + " (" + p.gap + (p.gap === 1 ? " day " : " days ") + (BD.doy(p.mo, p.d) > BD.doy(S.mo, S.d) ? "after" : "before") + ")"); }).join("") + "</div></div>";
			}
			var nr = [].concat.apply([], r[1]).sort(function (a, b) { return a.gap - b.gap || a.rank - b.rank; }).slice(0, 12);
			if (nr.length) h += '<div class="tu-card"><h3>Birthdays a day or two away</h3><div class="bd-minis">' + nr.map(function (p) { return mini(p, BD.dateText(p.mo, p.d) + ", " + p.y); }).join("") + "</div></div>";
			box.innerHTML = h;
		}).catch(function () { box.innerHTML = ""; });
	}
	function load() {
		$("bd-list").innerHTML = '<p class="bd-empty">Loading…</p>';
		var want = S.mo + "-" + S.d;
		L.day(S.mo, S.d).then(function (list) { if (want !== S.mo + "-" + S.d) return; DAY = list; render(); })
			.catch(function () { $("bd-list").innerHTML = '<p class="bd-empty">The list of people could not be loaded. Check your connection and reload.</p>'; });
	}

	/* ---------- name search ---------- */
	var searchT;
	function doSearch() {
		var q = $("bd-q").value.trim(), box = $("bd-results");
		if (q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
		L.index().then(function (idx) {
			if ($("bd-q").value.trim() !== q) return;
			var r = BD.search(idx, q, 12);
			box.innerHTML = r.length ? r.map(function (p) { return mini(p); }).join("") : '<p class="bd-empty">No one called “' + esc(q) + '” in the list.</p>';
			box.hidden = false;
		});
	}
	function goTo(dob, id) {
		var y = +dob.slice(0, 4), mo = +dob.slice(5, 7), d = +dob.slice(8, 10);
		S.hl = id || ""; S.alive = false;
		setDay(mo, d, S.y && !id ? S.y : null);
		$("bd-results").hidden = true;
		window.scrollTo({ top: $("bd-title").getBoundingClientRect().top + window.scrollY - 80, behavior: "smooth" });
	}

	/* ---------- wiring ---------- */
	function fromInput() {
		var p = window.ZD ? ZD.parseDate($("bd-date").value) : null;
		if (!p) { if ($("bd-date").value.trim()) toast("Type a date like Oct 26, 1980 or 1980-10-26"); return; }
		S.hl = ""; setDay(p.mo, p.d, p.y || null, true);
	}
	$("bd-go").addEventListener("click", function () { if ($("bd-date").value.trim()) fromInput(); else { S.hl = ""; setDay(+$("bd-month").value, +$("bd-day").value, null, true); } });
	$("bd-date").addEventListener("keydown", function (e) { if (e.key === "Enter") fromInput(); });
	$("bd-month").addEventListener("change", function () { $("bd-date").value = ""; S.hl = ""; S.mo = +$("bd-month").value; fillDays(); setDay(S.mo, +$("bd-day").value, null, true); });
	$("bd-day").addEventListener("change", function () { $("bd-date").value = ""; S.hl = ""; setDay(S.mo, +$("bd-day").value, null, true); });
	$("bd-today").addEventListener("click", function () { $("bd-date").value = ""; S.hl = ""; setDay(TODAY.mo, TODAY.d, null); });
	function step(n) { var t = BD.shift(S.mo, S.d, n); S.hl = ""; $("bd-date").value = ""; setDay(t.mo, t.d, null, true); }
	$("bd-prev").addEventListener("click", function () { step(-1); });
	$("bd-next").addEventListener("click", function () { step(1); });
	$("bd-fields").addEventListener("click", function (e) { var b = e.target.closest("[data-f]"); if (!b) return; S.field = b.getAttribute("data-f"); S.shown = PAGE; S.hl = ""; render(); });
	$("bd-country").addEventListener("change", function () { S.country = this.value; S.shown = PAGE; S.hl = ""; render(); });
	$("bd-era").addEventListener("change", function () { S.era = this.value; S.shown = PAGE; S.hl = ""; render(); });
	$("bd-sort").addEventListener("change", function () { S.sort = this.value; S.shown = PAGE; render(); });
	$("bd-alive").addEventListener("change", function () { S.alive = this.checked; S.shown = PAGE; S.hl = ""; render(); });
	$("bd-moreb").addEventListener("click", function () { S.shown += PAGE * 2; S.hl = ""; render(); });
	$("bd-q").addEventListener("input", function () { clearTimeout(searchT); searchT = setTimeout(doSearch, 160); });
	$("bd-q").addEventListener("keydown", function (e) { if (e.key === "Enter") { var b = $("bd-results").querySelector("[data-go]"); if (b) b.click(); } if (e.key === "Escape") { this.value = ""; doSearch(); } });
	root.addEventListener("click", function (e) { var b = e.target.closest("[data-go]"); if (b) goTo(b.getAttribute("data-go"), b.getAttribute("data-id")); });
	$("bd-copy").addEventListener("click", function () {
		var u = location.origin + "/birthday?" + BD.toQuery({ mo: S.mo, d: S.d, y: S.y, field: S.field, country: S.country, era: S.era, alive: S.alive, sort: S.sort });
		(navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy this link:", u); });
	});
	$("bd-gen").textContent = BD.DATA_V;

	/* ---------- start ---------- */
	var q = BD.fromQuery(location.search);
	if (q.mo) { S.mo = q.mo; S.d = q.d; S.y = q.y || null; if (q.y) $("bd-date").value = BD.dateText(q.mo, q.d, q.y); }
	["field", "country", "era", "alive", "sort"].forEach(function (k) { if (q[k] !== undefined) S[k] = q[k]; });
	fillPickers();
	if (q.q) { $("bd-q").value = q.q; doSearch(); }
	load();
})();
