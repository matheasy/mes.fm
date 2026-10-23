/* MES Birthday Personality -- mes.fm/birthday-personality (UI). Text engine in lib.js (global BP). Links: ?m=10&d=26[&y=1980].
 * The only thing fetched is the month's famous-people file from /birthday/data/MM.json (same files as mes.fm/birthday). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("bp");
	if (!root || !window.BP) return;
	var KEY = "mes-birthday-personality:v1", now = new Date(), TODAY = { y: now.getFullYear(), mo: now.getMonth() + 1, d: now.getDate() };
	var S = { mo: TODAY.mo, d: TODAY.d, y: null }, P = { mine: null };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || "null"); if (sv && sv.mine && BP.valid(sv.mine.mo, sv.mine.d)) P.mine = { mo: sv.mine.mo, d: sv.mine.d, y: sv.mine.y || null }; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function toast(msg) { var t = $("bp-toast"); if (!t) { t = document.createElement("div"); t.id = "bp-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function pad(n) { return (n < 10 ? "0" : "") + n; }
	var COL = { scarlet: "#d1202f", "flame orange": "#f26b1d", "ember red": "#b3361b", "moss green": "#5b7a2e", "sage green": "#8fa883", "earth brown": "#7a5230", "lemon yellow": "#f2dd38",
		"sky blue": "#7cc3ef", "electric teal": "#12b5b0", "pearl white": "#efece4", "sea green": "#2e8b6e", "silver blue": "#8aa4c2", gold: "#d4a017", "sunset orange": "#f4804a", crimson: "#b0122f",
		wheat: "#e3c98c", "slate grey": "#6b7785", olive: "#7d7b2e", "rose pink": "#f2a7bb", periwinkle: "#8f99e8", lilac: "#c8a2d6", "deep burgundy": "#6d1a2c", indigo: "#3f3d9c", "wine red": "#7b1d33",
		"royal purple": "#6a2c91", turquoise: "#30c5c0", plum: "#8e4585", charcoal: "#3b3f45", "forest green": "#2c6a3a", "steel grey": "#7d8792", "electric blue": "#2a6df4", aqua: "#3fd0d4",
		"lavender blue": "#a5b1ec", seafoam: "#93dfc3", "lagoon blue": "#2c8fb3", violet: "#7f3fbf", pearl: "#eae6dc", "sunny yellow": "#ffd23f", rose: "#e8798f", "deep blue": "#1f3f8f", silver: "#c0c4cc" };
	function swatches(text) {
		return text.toLowerCase().split(/, with |, | and /).map(function (c) { c = c.trim(); return COL[c] ? '<span class="bp-sw" style="background:' + COL[c] + '" aria-hidden="true"></span>' : ""; }).join("");
	}

	/* ---------- pickers ---------- */
	function fillPickers() {
		$("bp-month").innerHTML = BP.MONTHS.map(function (m, i) { return '<option value="' + (i + 1) + '">' + m + "</option>"; }).join("");
		fillDays();
	}
	function fillDays() {
		var n = BP.daysIn(S.mo), h = "";
		for (var d = 1; d <= n; d++) h += '<option value="' + d + '">' + d + "</option>";
		$("bp-day").innerHTML = h; $("bp-month").value = S.mo; $("bp-day").value = Math.min(S.d, n);
	}
	function readYear() {
		var v = $("bp-year").value.trim();
		if (!v) return null;
		var y = +v;
		if (!/^\d{3,4}$/.test(v) || y < 100 || y > TODAY.y) return NaN;
		return y;
	}
	function setDay(mo, d, keepYear) {
		S.mo = mo; S.d = Math.min(d, BP.daysIn(mo));
		if (!keepYear) { S.y = null; $("bp-year").value = ""; }
		fillDays(); render();
	}

	/* ---------- render ---------- */
	function dl(rows) { return rows.map(function (r) { return "<dt>" + r[0] + "</dt><dd>" + r[1] + "</dd>"; }).join(""); }
	function render() {
		var leapBad = S.y && S.mo === 2 && S.d === 29 && new Date(Date.UTC(S.y, 1, 29)).getUTCMonth() !== 1;
		if (leapBad) { toast(S.y + " was not a leap year, so there was no 29 February."); S.y = null; $("bp-year").value = ""; }
		var p = S.y ? BP.yearProfile(S.y, S.mo, S.d, TODAY) : BP.profile(S.mo, S.d, BP.birthdayYear(S.mo, S.d, TODAY));
		if (!p) return;
		var isToday = S.mo === TODAY.mo && S.d === TODAY.d;
		$("bp-date").textContent = (isToday && !S.y ? "Born today, " : "Born on ") + p.date + (S.y ? ", " + S.y : "");
		$("bp-title").textContent = p.title;
		$("bp-motto").textContent = "“" + p.motto + "”";
		var chips = ['<span class="bp-chip bp-' + p.element + '">' + p.sign.glyph + " " + p.sign.name + "</span>", '<span class="bp-chip">' + p.element + " · " + p.modality + "</span>",
			'<span class="bp-chip">Ruled by ' + esc(p.ruler) + "</span>", '<span class="bp-chip" title="' + esc(p.decan.dates) + '">' + esc(p.decan.text) + "</span>"];
		if (p.cusp) chips.push('<span class="bp-chip bp-cuspchip">' + esc(p.sign.name) + "–" + esc(p.cusp.with) + " cusp</span>");
		$("bp-chips").innerHTML = chips.join("");
		$("bp-summary").textContent = p.summary;
		$("bp-advice").innerHTML = "<strong>Advice from your day:</strong> " + esc(p.advice);
		$("bp-str").innerHTML = p.strengths.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
		$("bp-chal").innerHTML = p.challenges.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("");
		$("bp-love").textContent = p.love; $("bp-work").textContent = p.work;
		var ya = p.yearAhead;
		$("bp-yearh").textContent = "The year ahead: personal year " + ya.number + (S.y ? " (age " + p.age + " to " + (p.age + 1) + ")" : "");
		$("bp-yeart").textContent = ya.text;
		$("bp-lucky").innerHTML = dl([["Numbers", p.luckyNumbers.join(", ")], ["Colour", swatches(p.luckyColour) + esc(p.luckyColour)], ["Day", p.luckyDay + ' <span class="bp-small">(the day of ' + esc(p.ruler) + ")</span>"]]);
		var nums = [["Day number", p.dayNumber + (p.dayNumber > 9 ? ' <span class="bp-small">(master number; ' + p.birthDayNumber + " when reduced)</span>" : "") + " · " + esc(p.numberName)]];
		if (S.y) {
			nums.push(["Life path", p.lifePath.n + (p.lifePath.master ? " (master)" : "") + '<div class="bp-small">' + esc(p.lifePath.steps) + "</div><div>" + esc(p.lifePath.text) + "</div>"]);
			var c = p.chinese;
			nums.push(["Chinese zodiac", esc((c.yin ? "Yin " : "Yang ") + c.element + " " + c.animal) + ' <span class="bp-small">(' + (c.approximate ? "year " + c.year + ", approximate" : "year from Lunar New Year " + BP.MONTHS[c.newYear.mo - 1] + " " + c.newYear.d + ", " + c.newYear.y) + ")</span>"]);
			nums.push(["Age", p.age + (p.age === 1 ? " year" : " years")]);
		} else nums.push(["More", 'Add your birth year above for your life path number and Chinese zodiac animal.']);
		$("bp-nums").innerHTML = dl(nums);
		$("bp-matches").innerHTML = p.matches.map(function (m) {
			return '<button type="button" class="bp-match" data-m="' + m.mo + '" data-d="' + m.d + '"><span class="bp-mt">' + esc(m.title) + '</span><span class="bp-md">' + esc(m.date) + " · " + esc(m.sign) + '</span><span class="bp-mw">' + esc(m.why) + "</span></button>";
		}).join("");
		$("bp-famh").textContent = "Famous people born on " + p.date;
		$("bp-famlink").href = "/birthday?d=" + (S.y ? S.y + "-" : "") + pad(S.mo) + "-" + pad(S.d);
		$("bp-zlink").href = "/zodiac?d=" + (S.y ? S.y + "-" : "") + pad(S.mo) + "-" + pad(S.d);
		$("bp-zlink").textContent = S.y ? "Your birth chart" : "Zodiac sign for this date";
		var mine = P.mine && P.mine.mo === S.mo && P.mine.d === S.d && (P.mine.y || null) === (S.y || null);
		$("bp-mine").textContent = mine ? "Forget my birthday" : "Remember as my birthday";
		document.title = p.title + " (" + p.date + ") | MES Birthday Personality";
		renderCal(); loadFamous();
		history.replaceState(null, "", location.pathname + (isToday && !S.y ? "" : "?" + query()));
	}
	function query() { return "m=" + S.mo + "&d=" + S.d + (S.y ? "&y=" + S.y : ""); }

	/* ---------- famous people (same data as /birthday) ---------- */
	var FAM = {};
	function month(m) {
		if (!FAM[m]) FAM[m] = fetch("/birthday/data/" + pad(m) + ".json").then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).then(function (j) {
			var c = j.cols, ix = {}; c.forEach(function (k, i) { ix[k] = i; });
			return j.rows.map(function (r) { return { id: r[ix.id], name: r[ix.name], dob: r[ix.dob], desc: r[ix.desc], rank: r[ix.rank], wiki: r[ix.wiki], link: ix.link !== undefined ? r[ix.link] : "" }; });
		});
		return FAM[m];
	}
	function loadFamous() {
		var box = $("bp-famous"), want = S.mo + "-" + S.d;
		box.dataset.want = want; box.innerHTML = '<p class="bp-small">Loading…</p>';
		month(S.mo).then(function (list) {
			if (box.dataset.want !== want) return;
			var day = list.filter(function (p) { return +p.dob.slice(8, 10) === S.d; }).sort(function (a, b) { return a.rank - b.rank; }).slice(0, 8);
			box.innerHTML = day.length ? '<ul class="bp-famlist">' + day.map(function (p) {
				var u = p.link || (p.wiki ? "https://en.wikipedia.org/wiki/" + encodeURIComponent(p.wiki.replace(/ /g, "_")) : "https://www.wikidata.org/wiki/" + p.id);
				return '<li><a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(p.name) + "</a> <span>" + esc(p.dob.slice(0, 4)) + (p.desc ? " · " + esc(p.desc) : "") + "</span></li>";
			}).join("") + "</ul>" : '<p class="bp-small">No one in our list of famous people was born on this day.</p>';
		}).catch(function () { if (box.dataset.want === want) box.innerHTML = '<p class="bp-small">The list of famous people could not be loaded.</p>'; });
	}

	/* ---------- calendar of all 366 days ---------- */
	var calBuilt = false;
	function renderCal() {
		var cal = $("bp-cal");
		if (!calBuilt) {
			var all = BP.all(), h = "";
			for (var m = 1; m <= 12; m++) {
				h += '<div class="bp-mon"><h4>' + BP.MONTHS[m - 1] + '</h4><div class="bp-days">';
				all.filter(function (e) { return e.mo === m; }).forEach(function (e) {
					h += '<button type="button" class="bp-cd bp-' + e.element + '" data-m="' + e.mo + '" data-d="' + e.d + '" title="' + esc(e.title) + '" aria-label="' + esc(BP.MONTHS[e.mo - 1] + " " + e.d + ": " + e.title) + '">' + e.d + "</button>";
				});
				h += "</div></div>";
			}
			cal.innerHTML = h; calBuilt = true;
		}
		var old = cal.querySelector(".bp-on"); if (old) { old.classList.remove("bp-on"); old.removeAttribute("aria-current"); }
		var cur = cal.querySelector('[data-m="' + S.mo + '"][data-d="' + S.d + '"]'); if (cur) { cur.classList.add("bp-on"); cur.setAttribute("aria-current", "date"); }
	}
	function hoverText(e) {
		var b = e.target.closest && e.target.closest(".bp-cd"); if (!b) return;
		$("bp-hovert").textContent = BP.MONTHS[+b.dataset.m - 1] + " " + b.dataset.d + ": " + b.title;
	}
	$("bp-cal").addEventListener("mouseover", hoverText);
	$("bp-cal").addEventListener("focusin", hoverText);
	root.addEventListener("click", function (e) {
		var b = e.target.closest("[data-m][data-d]"); if (!b || !root.contains(b)) return;
		setDay(+b.dataset.m, +b.dataset.d); $("bp-results").hidden = true;
		if (b.closest(".bp-cal, .bp-matches, .bp-results")) $("bp-title").scrollIntoView({ block: "center", behavior: "smooth" });
	});

	/* ---------- search titles ---------- */
	$("bp-q").addEventListener("input", function () {
		var q = this.value.trim(), box = $("bp-results");
		if (q.length < 2) { box.hidden = true; box.innerHTML = ""; return; }
		var r = BP.search(q, 40);
		box.innerHTML = r.length ? r.map(function (e) { return '<button type="button" class="bp-res" data-m="' + e.mo + '" data-d="' + e.d + '"><span>' + esc(e.title) + '</span><small>' + BP.MONTHS[e.mo - 1].slice(0, 3) + " " + e.d + " · " + e.sign + "</small></button>"; }).join("")
			: '<p class="bp-small">No title matches “' + esc(q) + "”.</p>";
		box.hidden = false;
	});

	/* ---------- controls ---------- */
	$("bp-month").addEventListener("change", function () { S.mo = +this.value; fillDays(); S.d = +$("bp-day").value; render(); });
	$("bp-day").addEventListener("change", function () { S.d = +this.value; render(); });
	function go() { var y = readYear(); if (y !== y) { toast("Type a 4-digit birth year, e.g. 1990 (or leave it empty)."); $("bp-year").focus(); return; } S.y = y; S.mo = +$("bp-month").value; S.d = +$("bp-day").value; render(); }
	$("bp-go").addEventListener("click", go);
	$("bp-year").addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
	$("bp-year").addEventListener("change", go);
	$("bp-today").addEventListener("click", function () { setDay(TODAY.mo, TODAY.d); });
	function step(n) { var t = BP.fromDoy(((BP.doy(S.mo, S.d) - 1 + n) % 366 + 366) % 366 + 1); setDay(t.mo, t.d, false); }
	$("bp-prev").addEventListener("click", function () { step(-1); });
	$("bp-next").addEventListener("click", function () { step(1); });
	document.addEventListener("keydown", function (e) {
		if (e.altKey || e.ctrlKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target || {}).tagName || "")) return;
		if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1);
	});
	function link() { return location.origin + "/birthday-personality?m=" + S.mo + "&d=" + S.d; }   // shared links never carry the birth year
	function copy(u) { (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy this link:", u); }); }
	$("bp-copy").addEventListener("click", function () { copy(location.origin + location.pathname + "?" + query()); });
	$("bp-share").addEventListener("click", function () {
		var t = BP.MONTHS[S.mo - 1] + " " + S.d + " birthdays: " + BP.titleOf(S.mo, S.d);
		if (navigator.share) navigator.share({ title: t, text: t, url: link() }).catch(function () {}); else copy(link());
	});
	$("bp-print").addEventListener("click", function () { window.print(); });
	$("bp-mine").addEventListener("click", function () {
		var mine = P.mine && P.mine.mo === S.mo && P.mine.d === S.d && (P.mine.y || null) === (S.y || null);
		P.mine = mine ? null : { mo: S.mo, d: S.d, y: S.y || null }; save(); render();
		toast(mine ? "Forgotten" : "Saved in this browser: the page opens on your birthday next time");
	});

	/* ---------- start ---------- */
	fillPickers();
	var q = new URLSearchParams(location.search), qm = +q.get("m"), qd = +q.get("d"), qy = +q.get("y");
	if (BP.valid(qm, qd)) { S.mo = qm; S.d = qd; if (qy >= 100 && qy <= TODAY.y) S.y = qy; }
	else if (P.mine) { S.mo = P.mine.mo; S.d = P.mine.d; S.y = P.mine.y; }
	if (S.y) $("bp-year").value = S.y;
	fillDays(); render();
})();
