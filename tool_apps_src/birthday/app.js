/* MES Famous Birthdays -- mes.fm/birthday (UI). Helpers + loader in lib.js (global BD); Sun sign / Chinese animal from the zodiac page's lib (global ZD,
 * on Astronomy Engine). Links: ?d=10-26 | ?d=1980-10-26, &q= (name filter), &f= field, &c= country, &e= era, &a=1 living, &s= sort. Nothing is stored or sent. */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("bd");
	if (!root || !window.BD) return;
	var L = BD.loader("/birthday/data/"), PAGE = 30;
	var now = new Date(), TODAY = { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() };
	var S = { mo: TODAY.mo, d: TODAY.d, y: null, me: null, field: "", country: "", era: "", alive: false, sort: "fame", shown: PAGE, hl: "" };
	// per-browser preferences (never sent): pictures on / off, and the "Line them up" list
	var KEY = "mes-birthday:v1", P = { pics: true, friends: [] };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv) { if (typeof sv.pics === "boolean") P.pics = sv.pics; if (Array.isArray(sv.friends)) P.friends = sv.friends.filter(function (f) { return f && typeof f.n === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f.d); }).slice(0, 12); } } catch (e) {}
	function savePrefs() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
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
	function avatar(p) {
		if (!P.pics) return "";
		var u = BD.thumbUrl(p.img, 120), ini = '<span class="bd-ini" aria-hidden="true">' + esc(BD.initials(p.name)) + "</span>";
		if (!u) return '<span class="bd-av bd-av--none">' + ini + "</span>";
		return '<a class="bd-av" href="' + esc(BD.commonsUrl(p.img)) + '" target="_blank" rel="noopener" title="Photo from Wikimedia Commons: ' + esc(p.img.slice(3).replace(/_/g, " ")) + ' (opens the file page with its author and licence)">' + ini +
			'<img src="' + esc(u) + '" width="60" height="60" loading="lazy" decoding="async" alt="' + esc(p.name) + '" referrerpolicy="no-referrer"></a>';
	}
	function zodiacUrl(p, extra) { return "/zodiac?d=" + BD.iso(p) + (extra || ""); }
	function card(p) {
		var url = p.link || BD.wikiUrl(p), cmp = "/zodiac?p=" + encodeURIComponent(p.id) + (S.me ? "&d=" + BD.iso(S.me) : "");
		return '<div class="bd-p' + (p.id === S.hl ? " bd-hl" : "") + '" id="p-' + esc(p.id) + '">' + avatar(p) +
			'<div class="bd-main"><div class="bd-top"><a class="bd-name" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(p.name) + "</a>" +
			'<span class="bd-life">' + esc(BD.lifeText(p, TODAY)) + "</span></div>" +
			(S.me ? '<div class="bd-gap">' + esc(BD.ageGapText(p, S.me)) + "</div>" : "") +
			(p.desc ? '<div class="bd-desc">' + esc(p.desc) + "</div>" : "") +
			'<div class="bd-meta"><span class="bd-tag bd-f-' + esc(p.field) + '">' + esc(BD.FIELDS[p.field] || "Other") + "</span>" +
			(p.country ? '<span class="bd-ctry">' + esc(p.country) + "</span>" : "") + signHtml(p) +
			'<a class="bd-cmp" href="' + esc(cmp) + '">' + (S.me ? "Compare signs with yours" : "Compare signs") + "</a>" +
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
		renderYou(); renderNext(); renderExtra(); renderLine(); otdReset();
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
		h += '<p class="bd-youline" id="bd-twin"></p>';
		box.innerHTML = h + "</div>"; box.hidden = false;
		var want = BD.iso(me);
		L.index().then(function (idx) {
			var t = BD.closestTwin(idx, me.y, me.mo, me.d), el = $("bd-twin");
			if (!t || !el || BD.iso(S.me || {}) !== want) return;
			el.innerHTML = "Closest birth-date twin: " + mini(t, t.gap === 0 ? "born the same day as you" : BD.dobText(t.dob) + ", " + t.gap + (t.gap === 1 ? " day " : " days ") + (BD.dayNum(t) < BD.dayNum(me) ? "before you" : "after you"));
		}).catch(function () {});
	}
	// "Next October 26": weekday, days to go, the age you turn, and famous living people turning N that day
	function renderNext() {
		var box = $("bd-nextc"), mine = S.me && S.me.mo === S.mo && S.me.d === S.d, nb = BD.nextBirthday(S.mo, S.d, TODAY, mine ? S.me.y : null);
		var when = BD.WEEKDAYS[nb.wd] + ", " + BD.dateText(nb.mo, nb.d, nb.y), soon = nb.days === 0 ? "today!" : nb.days === 1 ? "tomorrow" : "in " + nb.days + " days";
		var h = '<div class="bd-nextbig"><span class="bd-nextn">' + (nb.days === 0 ? "🎉" : nb.days) + '</span><span class="bd-nextl">' + (nb.days === 0 ? "today" : nb.days === 1 ? "day to go" : "days to go") + "</span></div><div>";
		h += "<h3>" + (mine ? "Your next birthday" : "Next " + esc(BD.dateText(S.mo, S.d))) + "</h3><p>" + esc(when) + (nb.days === 0 ? ": today!" : ", " + soon + ".") + (mine && nb.turns > 0 ? " You turn <strong>" + nb.turns + "</strong>." : "") + "</p>";
		var turning = DAY.filter(function (p) { return BD.alive(p, TODAY) && p.d === nb.d; }).slice(0, 3);
		if (turning.length) h += '<p class="bd-turns">' + turning.map(function (p) { return esc(p.name) + " turns " + (nb.y - p.y); }).join(" · ") + " that day.</p>";
		if (S.mo === 2 && S.d === 29 && nb.d === 28) h += '<p class="bd-turns">Not a leap year, so most people born on 29 February celebrate on 28 February.</p>';
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
			[["bd-prevn", r[1][1]], ["bd-nextn2", r[1][2]]].forEach(function (x) { var el = $(x[0]), top = BD.sortBy(x[1], "fame")[0]; if (el) el.textContent = top ? top.name : ""; });
			[["bd-prevd", near[1]], ["bd-nextd", near[2]]].forEach(function (x) { var el = $(x[0]); if (el) el.textContent = BD.MONTHS[x[1].mo - 1].slice(0, 3) + " " + x[1].d; });
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
		S.hl = ""; if (p.y) S.me = { y: p.y, mo: p.mo, d: p.d };
		setDay(p.mo, p.d, p.y || null, true);
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
	$("bd-gen").textContent = BD.DATA_V.slice(0, 10);

	/* ---------- pictures on / off ---------- */
	function applyPics() { root.classList.toggle("bd-nopics", !P.pics); $("bd-pics").checked = P.pics; }
	$("bd-pics").addEventListener("change", function () { P.pics = this.checked; savePrefs(); applyPics(); render(); });
	// a portrait that fails to load (deleted file, blocked host) leaves the initials avatar underneath
	root.addEventListener("error", function (e) { var t = e.target; if (t && t.tagName === "IMG" && t.parentNode && t.parentNode.classList.contains("bd-av")) { t.parentNode.classList.add("bd-av--none"); t.remove(); } }, true);
	applyPics();

	/* ---------- Line them up (friends, kept in this browser only) ---------- */
	function renderLine() {
		var box = $("bd-line"), rows = P.friends.map(function (f) { var y = +f.d.slice(0, 4), mo = +f.d.slice(5, 7), d = +f.d.slice(8, 10); return { name: f.n, y: y, mo: mo, d: d, friend: true }; });
		if (S.me) rows.push({ name: "You", y: S.me.y, mo: S.me.mo, d: S.me.d, you: true });
		rows.sort(function (a, b) { return BD.dayNum(a) - BD.dayNum(b); });
		if (!rows.length) { box.innerHTML = '<p class="tu-note" style="margin:0.4em 0 0;">Add a friend or relative to compare ages and signs. Type your own birthday (with the year) above to be in the line too.</p>'; return; }
		var h = '<div class="tu-table-wrap"><table class="tu-table bd-ltab"><thead><tr><th>Name</th><th>Born</th><th>Age</th><th>Signs</th><th>Next birthday</th>' + (S.me ? "<th>Compared with you</th>" : "") + "<th></th></tr></thead><tbody>";
		rows.forEach(function (r) {
			var sg = signs(r), nb = BD.nextBirthday(r.mo, r.d, TODAY, r.y), i = r.friend ? P.friends.findIndex(function (f) { return f.n === r.name && f.d === BD.iso(r); }) : -1;
			h += "<tr" + (r.you ? ' class="bd-lyou"' : "") + "><td>" + esc(r.name) + "</td><td>" + esc(BD.dateText(r.mo, r.d, r.y)) + "</td><td>" + BD.ageOn(r.y, r.mo, r.d, TODAY) + "</td><td>" +
				(sg.sun ? sg.sun.glyph + " " + sg.sun.name : "") + (sg.cn ? " · " + sg.cn.emoji + " " + sg.cn.animal : "") + "</td><td>" + (nb.days === 0 ? "today 🎉" : "in " + nb.days + " d, turns " + nb.turns) + "</td>" +
				(S.me ? "<td>" + (r.you ? "—" : esc(BD.ageGapText(r, S.me))) + "</td>" : "") +
				"<td>" + (i >= 0 ? '<button type="button" class="bd-x" data-del="' + i + '" aria-label="Remove ' + esc(r.name) + '">✕</button>' : "") + "</td></tr>";
		});
		box.innerHTML = h + "</tbody></table></div>";
	}
	$("bd-ladd").addEventListener("click", function () {
		var n = $("bd-lname").value.trim().slice(0, 40), p = window.ZD ? ZD.parseDate($("bd-ldate").value) : null;
		if (!p || !p.y) { toast("Type their birthday with the year, e.g. 1984-03-02"); $("bd-ldate").focus(); return; }
		if (P.friends.length >= 12) { toast("Up to 12 people"); return; }
		P.friends.push({ n: n || "Friend " + (P.friends.length + 1), d: BD.iso(p) }); savePrefs();
		$("bd-lname").value = ""; $("bd-ldate").value = ""; renderLine();
	});
	$("bd-ldate").addEventListener("keydown", function (e) { if (e.key === "Enter") $("bd-ladd").click(); });
	$("bd-line").addEventListener("click", function (e) { var b = e.target.closest("[data-del]"); if (!b) return; P.friends.splice(+b.getAttribute("data-del"), 1); savePrefs(); renderLine(); });

	/* ---------- On this day (Wikipedia feed, CC BY-SA): loaded when the section comes into view, cached for the tab's session ---------- */
	var OTD = { tab: "events", open: false, all: false };
	function otdKey(t) { return "mes-otd:" + t + ":" + BD.pad(S.mo) + "-" + BD.pad(S.d); }
	function otdReset() { OTD.all = false; if (OTD.open) otdLoad(); else $("bd-otdlist").innerHTML = ""; $("bd-otdh").textContent = "On this day, " + BD.dateText(S.mo, S.d); }
	function otdLoad() {
		var t = OTD.tab, key = otdKey(t), box = $("bd-otdlist"), cached = null;
		OTD.open = true;
		Array.prototype.forEach.call($("bd-otdtabs").querySelectorAll("[data-otd]"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-otd") === t)); });
		try { cached = JSON.parse(sessionStorage.getItem(key) || "null"); } catch (e) {}
		if (cached) { otdShow(cached); return; }
		box.innerHTML = '<p class="bd-empty">Loading from Wikipedia…</p>';
		fetch("https://en.wikipedia.org/api/rest_v1/feed/onthisday/" + t + "/" + BD.pad(S.mo) + "/" + BD.pad(S.d), { headers: { "Api-User-Agent": "MES Famous Birthdays (https://mes.fm/birthday)" } })
			.then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
			.then(function (j) {
				var list = BD.slimOnThisDay(j, t);
				try { sessionStorage.setItem(key, JSON.stringify(list)); } catch (e) {}
				if (key === otdKey(OTD.tab)) otdShow(list);
			})
			.catch(function () { if (key === otdKey(OTD.tab)) box.innerHTML = '<p class="bd-empty">Wikipedia could not be reached (offline, or blocked by an extension). <a href="https://en.wikipedia.org/wiki/' + BD.MONTHS[S.mo - 1] + "_" + S.d + '" target="_blank" rel="noopener">Open ' + BD.dateText(S.mo, S.d) + " on Wikipedia</a>.</p>"; });
	}
	function otdShow(list) {
		var box = $("bd-otdlist"), n = OTD.all ? list.length : 15;
		if (!list.length) { box.innerHTML = '<p class="bd-empty">Nothing listed for this day.</p>'; return; }
		var h = '<ul class="bd-otd">' + list.slice(0, n).map(function (e) {
			return "<li>" + (e.y !== null ? '<span class="bd-oty">' + (e.y < 0 ? -e.y + " BC" : e.y) + "</span>" : "") + '<span class="bd-ott">' + esc(e.t) +
				(e.u && /^https:\/\/en\.wikipedia\.org\//.test(e.u) ? ' <a href="' + esc(e.u) + '" target="_blank" rel="noopener">' + esc(e.a) + " →</a>" : "") + "</span></li>";
		}).join("") + "</ul>";
		if (list.length > n) h += '<button type="button" class="tu-btn" id="bd-otdmore">Show all ' + list.length + "</button>";
		box.innerHTML = h;
	}
	$("bd-otdtabs").addEventListener("click", function (e) { var b = e.target.closest("[data-otd]"); if (!b) return; OTD.tab = b.getAttribute("data-otd"); OTD.all = false; otdLoad(); });
	$("bd-otdlist").addEventListener("click", function (e) { if (e.target.id === "bd-otdmore") { OTD.all = true; otdLoad(); } });
	if ("IntersectionObserver" in window) {
		var io = new IntersectionObserver(function (en) { if (en.some(function (x) { return x.isIntersecting; })) { io.disconnect(); if (!OTD.open) otdLoad(); } }, { rootMargin: "200px" });
		io.observe($("bd-otdc"));
	} else otdLoad();

	/* ---------- start ---------- */
	var q = BD.fromQuery(location.search);
	if (q.mo) { S.mo = q.mo; S.d = q.d; S.y = q.y || null; if (q.y) { $("bd-date").value = BD.dateText(q.mo, q.d, q.y); S.me = { y: q.y, mo: q.mo, d: q.d }; } }
	["field", "country", "era", "alive", "sort"].forEach(function (k) { if (q[k] !== undefined) S[k] = q[k]; });
	fillPickers();
	if (q.q) { $("bd-q").value = q.q; doSearch(); }
	load();
})();
