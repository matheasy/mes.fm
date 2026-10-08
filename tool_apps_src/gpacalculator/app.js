/* MES GPA Calculator 2.0 -- mes.fm/gpacalculator (UI; maths + share encoding in lib.js, global GP).
 * localStorage "mes-gpacalculator:v1"; ?s=<encoded workspace> carries it to another device; the old /gpacalculator/s/<id> links still resolve via /api/share?calc=gpa.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("gp");
	if (!root || !window.GP) return;
	var KEY = "mes-gpacalculator:v1";
	var EXAMPLES = [
		["Letters and credits", { scale: "4", terms: [["Fall", [["Calculus", "A-", "4"], ["Physics", "B+", "4"], ["History", "B", "3"], ["English", "A", "3"]]]] }],
		["Percentages", { scale: "4", terms: [["Semester", [["Math", "92", "3"], ["Biology", "85", "4"], ["Spanish", "78", "3"], ["Art", "96", "2"]]]] }],
		["Cumulative, two terms", { scale: "4", prior: ["3.4", "45"], terms: [["Fall", [["Chem", "A-", "4"], ["Stats", "B", "3"], ["Writing", "A", "3"]]], ["Spring", [["Orgo", "B+", "4"], ["Econ", "A-", "3"]]]] }]
	];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var ws, memOnly = false;
	function normalise(w) {
		w.scale = w.scale === "433" ? "433" : "4"; w.weighted = !!w.weighted;
		w.prior = { gpa: String((w.prior || {}).gpa || ""), credits: String((w.prior || {}).credits || "") };
		w.plan = { target: String((w.plan || {}).target || ""), credits: String((w.plan || {}).credits || "") };
		if (!Array.isArray(w.terms) || !w.terms.length) w.terms = [GP.blankTerm("Term 1")];
		w.terms.forEach(function (t) { t.name = String(t.name || "Term"); if (!Array.isArray(t.courses)) t.courses = []; t.courses = t.courses.map(function (c) { return { n: String(c.n || ""), g: String(c.g || ""), c: String(c.c || ""), l: c.l === "h" || c.l === "a" ? c.l : "r" }; }); if (!t.courses.length) while (t.courses.length < 5) t.courses.push(GP.blankCourse()); });
		if (!(w.cur >= 0 && w.cur < w.terms.length)) w.cur = 0;
		return w;
	}
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && Array.isArray(s.terms)) return normalise(s); } catch (e) { memOnly = true; } return GP.blankWs(); }
	function term() { return ws.terms[ws.cur]; }
	function save() {
		try { localStorage.setItem(KEY, JSON.stringify(ws)); memOnly = false; } catch (e) { memOnly = true; }
		$("gp-store-note").textContent = memOnly ? "Your browser is blocking storage, so your courses will be lost when you close this tab. Copy a link to keep them." : "Saved in this browser.";
	}
	function toast(msg) {
		var t = $("gp-toast"); if (!t) { t = document.createElement("div"); t.id = "gp-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700);
	}
	function copy(text, msg) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb();
	}
	function notice(h) { var n = $("gp-notice"); n.innerHTML = h || ""; n.hidden = !h; }

	/* ---------- options ---------- */
	function fillOpts() {
		[].forEach.call($("gp-scale").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.scale === ws.scale)); });
		$("gp-weighted").checked = ws.weighted; $("gp-pgpa").value = ws.prior.gpa; $("gp-pcr").value = ws.prior.credits; $("gp-ptarget").value = ws.plan.target; $("gp-pnext").value = ws.plan.credits;
		$("gp-priorbox").open = !!(ws.prior.gpa || ws.prior.credits);
		$("gp-letters").innerHTML = GP.SCALES[ws.scale].letters.map(function (l) { return '<option value="' + l[0] + '">'; }).join("");
		$("gp-tname").value = term().name;
	}
	$("gp-scale").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; ws.scale = b.dataset.scale; save(); fillOpts(); renderRows(); update(); });
	$("gp-weighted").addEventListener("change", function () { ws.weighted = this.checked; save(); renderRows(); update(); });
	[["gp-pgpa", "prior", "gpa"], ["gp-pcr", "prior", "credits"], ["gp-ptarget", "plan", "target"], ["gp-pnext", "plan", "credits"]].forEach(function (p) { $(p[0]).addEventListener("input", function () { ws[p[1]][p[2]] = this.value; save(); update(); }); });
	$("gp-tname").addEventListener("input", function () { term().name = this.value; var t = $("gp-terms").querySelector('.gp-tab[data-i="' + ws.cur + '"]'); if (t) t.textContent = this.value || "Term"; save(); update(); });

	/* ---------- terms ---------- */
	function renderTerms() {
		$("gp-terms").innerHTML = ws.terms.map(function (t, i) { return '<button type="button" role="tab" class="gp-tab" data-i="' + i + '" aria-selected="' + (i === ws.cur) + '">' + esc(t.name || "Term") + "</button>"; }).join("") +
			'<button type="button" class="gp-tab gp-tab--add" id="gp-addterm">+ Term</button>' +
			(ws.terms.length > 1 ? '<button type="button" class="gp-tab gp-tab--del" id="gp-delterm" title="Delete this term" aria-label="Delete this term">🗑</button>' : "");
	}
	$("gp-terms").addEventListener("click", function (e) {
		if (e.target.closest("#gp-addterm")) { ws.terms.push(GP.blankTerm("Term " + (ws.terms.length + 1))); ws.cur = ws.terms.length - 1; save(); renderAll(); $("gp-tname").select(); return; }
		if (e.target.closest("#gp-delterm")) {
			var snap = JSON.stringify(ws); ws.terms.splice(ws.cur, 1); ws.cur = Math.min(ws.cur, ws.terms.length - 1); save(); renderAll();
			notice('Term deleted. <button type="button" class="tu-chip" id="gp-undo">Undo</button>'); $("gp-undo").onclick = function () { ws = normalise(JSON.parse(snap)); save(); renderAll(); notice(""); }; return;
		}
		var t = e.target.closest(".gp-tab"); if (t && t.dataset.i != null) { ws.cur = +t.dataset.i; save(); renderAll(); }
	});

	/* ---------- course rows ---------- */
	function rowHtml(c, i) {
		var g = GP.parseGrade(c.g, ws.scale), bad = c.g.trim() && !g;
		return '<div class="gp-row rw-row" data-i="' + i + '"><span class="gp-n rw-num">' + (i + 1) + '</span>' +
			'<div class="gp-f rw-f rw-name gp-f-n"><label>Course</label><input class="tu-input" data-k="n" type="text" maxlength="60" autocomplete="off" placeholder="optional" value="' + esc(c.n) + '"></div>' +
			'<div class="gp-f rw-f gp-f-g"><label>Grade</label><input class="tu-input' + (bad ? " gp-bad" : "") + '" data-k="g" type="text" list="gp-letters" autocomplete="off" autocapitalize="characters" placeholder="A- or 92" value="' + esc(c.g) + '" aria-invalid="' + !!bad + '"></div>' +
			'<div class="gp-f rw-f gp-f-c"><label>Credits</label><input class="tu-input" data-k="c" type="text" inputmode="decimal" autocomplete="off" placeholder="1" value="' + esc(c.c) + '"></div>' +
			(ws.weighted ? '<div class="gp-f rw-f gp-f-l"><label>Level</label><select class="tu-select" data-k="l"><option value="r"' + (c.l === "r" ? " selected" : "") + '>Regular</option><option value="h"' + (c.l === "h" ? " selected" : "") + '>Honors</option><option value="a"' + (c.l === "a" ? " selected" : "") + '>AP / IB</option></select></div>' : "") +
			'<span class="gp-pts rw-pts" data-pts>' + (g ? GP.fix(g.pts, 2) + " pts" : "") + '</span>' +
			'<button type="button" class="tu-btn tu-btn--ghost gp-del rw-del" title="Remove this course" aria-label="Remove course ' + (i + 1) + '">✕</button></div>';
	}
	
	/* ---------- row layout options: names on / off, table layout. One preference shared by the grade, GPA and weighted-average calculators ---------- */
	var RW = { names: true, table: false, KEY: "mes-rowprefs:v1" };
	try { var rwo = JSON.parse(localStorage.getItem(RW.KEY) || "{}"); if (rwo.names === false) RW.names = false; if (rwo.table === true) RW.table = true; } catch (e) {}
	function rwBar(box, redraw) {
		var bar = document.createElement("div"); bar.className = "rw-bar";
		bar.innerHTML = '<button type="button" class="tu-chip" data-rw="names" title="Show or hide the name field on every row (rows are then just numbered)">Names</button><button type="button" class="tu-chip" data-rw="table" title="Compact table layout for quick entry">Table layout</button>';
		box.parentNode.insertBefore(bar, box);
		bar.addEventListener("click", function (e) { var b = e.target.closest("[data-rw]"); if (!b) return; RW[b.dataset.rw] = !RW[b.dataset.rw]; try { localStorage.setItem(RW.KEY, JSON.stringify({ names: RW.names, table: RW.table })); } catch (x) {} redraw(); });
	}
	function rwDecorate(box) {
		box.dataset.names = RW.names ? "1" : "0"; box.dataset.table = RW.table ? "1" : "0";
		var bar = box.previousElementSibling; if (bar && bar.classList.contains("rw-bar")) [].forEach.call(bar.children, function (b) { b.setAttribute("aria-pressed", String(!!RW[b.dataset.rw])); });
		var first = box.querySelector(".rw-row"); if (!first) return;
		var f = [].slice.call(first.querySelectorAll(".rw-f")), nOther = f.filter(function (x) { return !x.classList.contains("rw-name"); }).length, pts = !!first.querySelector(".rw-pts");
		box.style.setProperty("--rw-cols", "1.7em " + (RW.names ? "minmax(0,1.6fr) " : "") + "repeat(" + nOther + ",minmax(0,1fr)) " + (pts ? "3.6em " : "") + "2.3em");
		if (RW.table) { var h = '<div class="rw-head"><span>#</span>'; f.forEach(function (x) { if (RW.names || !x.classList.contains("rw-name")) h += "<span>" + esc(x.querySelector("label").textContent) + "</span>"; }); box.insertAdjacentHTML("afterbegin", h + (pts ? "<span>Pts</span>" : "") + "<span></span></div>"); }
	}
	function renderRows() { $("gp-rows").innerHTML = term().courses.map(rowHtml).join(""); rwDecorate($("gp-rows")); }
	rwBar($("gp-rows"), renderRows);
	$("gp-rows").addEventListener("input", function (e) {
		var row = e.target.closest(".gp-row"); if (!row) return; var c = term().courses[+row.dataset.i], k = e.target.dataset.k; c[k] = e.target.value;
		if (k === "g") { var g = GP.parseGrade(c.g, ws.scale), bad = c.g.trim() && !g; e.target.classList.toggle("gp-bad", !!bad); e.target.setAttribute("aria-invalid", String(!!bad)); row.querySelector("[data-pts]").textContent = g ? GP.fix(g.pts, 2) + " pts" : ""; }
		save(); update();
	});
	$("gp-rows").addEventListener("change", function (e) { if (e.target.dataset.k === "l") { var row = e.target.closest(".gp-row"); term().courses[+row.dataset.i].l = e.target.value; save(); update(); } });
	$("gp-rows").addEventListener("click", function (e) {
		var b = e.target.closest(".gp-del"); if (!b) return; var i = +b.closest(".gp-row").dataset.i, cs = term().courses;
		if (cs.length > 1) cs.splice(i, 1); else cs[0] = GP.blankCourse();
		save(); renderRows(); update();
	});
	$("gp-rows").addEventListener("keydown", function (e) {
		if (e.key !== "Enter" || !e.target.dataset.k) return; e.preventDefault();
		var r = e.target.closest(".gp-row"), next = r.nextElementSibling;
		if (!next) { term().courses.push(GP.blankCourse()); save(); renderRows(); next = $("gp-rows").lastElementChild; }
		var inp = next.querySelector('[data-k="' + e.target.dataset.k + '"]'); if (inp) inp.focus();
	});
	$("gp-add").onclick = function () { term().courses.push(GP.blankCourse()); save(); renderRows(); update(); var l = $("gp-rows").querySelector(".gp-row:last-child input"); if (l) l.focus(); };
	$("gp-clear").onclick = function () { var snap = JSON.stringify(ws); var t = GP.blankTerm(term().name); ws.terms[ws.cur] = t; save(); renderRows(); update(); notice('Term cleared. <button type="button" class="tu-chip" id="gp-undo">Undo</button>'); $("gp-undo").onclick = function () { ws = normalise(JSON.parse(snap)); save(); renderAll(); notice(""); }; };

	$("gp-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("gp-examples").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return; var ex = EXAMPLES[+b.dataset.i][1], w = GP.blankWs();
		w.scale = ex.scale; if (ex.prior) w.prior = { gpa: ex.prior[0], credits: ex.prior[1] };
		w.terms = ex.terms.map(function (t) { return { name: t[0], courses: t[1].map(function (c) { return { n: c[0], g: c[1], c: c[2], l: "r" }; }) }; });
		ws = normalise(w); save(); renderAll();
	});

	/* ---------- results ---------- */
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var last = null;
	function update() {
		var t = GP.term(term().courses, ws.scale, ws.weighted), all = GP.overall(ws), multi = ws.terms.length > 1 || all.hasPrior; last = { t: t, all: all };
		var ok = t.gpa != null || all.gpa != null;
		$("gp-empty").hidden = ok; $("gp-out").hidden = !ok; if (!ok) return;
		var hero = [], S = ws.scale;
		if (multi && all.gpa != null) hero.push(stat("Cumulative GPA", GP.fix(all.gpa, 2), "about " + GP.letterFor(all.gpa, S) + " &middot; " + GP.fix(all.credits, 2).replace(/\.?0+$/, "") + " credits in total", "tu-stat--hero"));
		if (t.gpa != null) hero.push(stat(multi ? esc(term().name || "This term") + " GPA" : "Your GPA", GP.fix(t.gpa, 2), "about " + GP.letterFor(t.gpa, S) + " on the " + GP.SCALES[S].name + " scale", multi ? "" : "tu-stat--hero"));
		if (t.gpa != null) hero.push(stat("Credits this term", GP.fix(t.credits, 2).replace(/\.?0+$/, ""), t.used + " course" + (t.used === 1 ? "" : "s") + " counted" + (t.skipped ? ", " + t.skipped + ' skipped (check the grade)' : "")));
		if (t.gpa != null) hero.push(stat("Quality points", GP.fix(t.qp, 2), "grade points &times; credits"));
		$("gp-hero").innerHTML = hero.join("");
		// per-course table of the current term
		var rows = term().courses.map(function (c, i) { var g = GP.parseGrade(c.g, S); if (!g) return ""; var cr = c.c.trim() === "" ? 1 : GP.num(c.c); if (cr == null || cr < 0) return ""; var pts = g.pts + (ws.weighted && g.pts > 0 ? { r: 0, h: 0.5, a: 1 }[c.l] || 0 : 0); return "<tr><td>" + esc(c.n || "Course " + (i + 1)) + "</td><td>" + esc(c.g.trim().toUpperCase()) + (g.kind === "pct" ? " <small>" + g.label + "</small>" : "") + "</td><td>" + GP.fix(pts, 2) + "</td><td>" + GP.fix(cr, 2).replace(/\.?0+$/, "") + "</td><td>" + GP.fix(pts * cr, 2) + "</td></tr>"; }).join("");
		$("gp-courses-card").hidden = !rows;
		$("gp-table").innerHTML = rows ? "<thead><tr><th>Course</th><th>Grade</th><th>Points</th><th>Credits</th><th>Quality points</th></tr></thead><tbody>" + rows + "</tbody>" : "";
		// all terms
		var tc = $("gp-termsum-card"); tc.hidden = !multi;
		if (multi) {
			$("gp-termsum").innerHTML = "<thead><tr><th>Term</th><th>GPA</th><th>Credits</th></tr></thead><tbody>" +
				(all.hasPrior ? "<tr><td>Before these terms</td><td>" + GP.fix(GP.num(ws.prior.gpa), 2) + "</td><td>" + GP.fix(GP.num(ws.prior.credits), 2).replace(/\.?0+$/, "") + "</td></tr>" : "") +
				ws.terms.map(function (x, i) { var r = all.terms[i]; return '<tr class="gp-trow' + (i === ws.cur ? " gp-sel" : "") + '" data-i="' + i + '" tabindex="0"><td>' + esc(x.name || "Term") + "</td><td>" + (r.gpa == null ? "–" : GP.fix(r.gpa, 2)) + "</td><td>" + (r.credits ? GP.fix(r.credits, 2).replace(/\.?0+$/, "") : "–") + "</td></tr>"; }).join("") +
				'<tr class="gp-total"><td>Cumulative</td><td>' + (all.gpa == null ? "–" : GP.fix(all.gpa, 2)) + "</td><td>" + GP.fix(all.credits, 2).replace(/\.?0+$/, "") + "</td></tr></tbody>";
		}
		// planner
		var P = GP.planNeeded(all, S, ws.plan.target, ws.plan.credits), out = $("gp-plan-out");
		if (!P) out.innerHTML = "Enter the cumulative GPA you want and how many credits you will take next.";
		else if (P.status === "ok") out.innerHTML = "You need a GPA of <b>" + GP.fix(P.need, 2) + "</b> (about " + GP.letterFor(P.need, S) + ") over your next " + GP.fix(GP.num(ws.plan.credits), 2).replace(/\.?0+$/, "") + " credits to reach a cumulative <b>" + GP.fix(GP.num(ws.plan.target), 2) + "</b>.";
		else if (P.status === "secure") out.innerHTML = '<span class="tu-pos">Already there:</span> even a 0.00 next term would leave you at or above ' + GP.fix(GP.num(ws.plan.target), 2) + ".";
		else out.innerHTML = '<span class="tu-neg">Out of reach:</span> you would need ' + GP.fix(P.need, 2) + ", above the " + GP.fix(P.max, 2) + " maximum, over those credits. Try more credits or a lower goal.";
	}
	$("gp-termsum").addEventListener("click", function (e) { var r = e.target.closest(".gp-trow"); if (r) { ws.cur = +r.dataset.i; save(); renderAll(); } });
	$("gp-termsum").addEventListener("keydown", function (e) { if (e.key === "Enter") { var r = e.target.closest(".gp-trow"); if (r) r.click(); } });

	/* ---------- reference table ---------- */
	(function () {
		var A = GP.SCALES["4"], B = GP.SCALES["433"], h = "<thead><tr><th>Letter</th><th>4.0 scale</th><th>4.33 scale</th></tr></thead><tbody>";
		A.letters.forEach(function (l, i) { h += "<tr><td>" + l[0] + "</td><td>" + GP.fix(l[1], 2) + "</td><td>" + GP.fix(B.letters[i][1], 2) + "</td></tr>"; });
		$("gp-ref").innerHTML = h + "</tbody>";
	})();

	/* ---------- save and share ---------- */
	function link(onlyCur, what) { var url = location.origin + "/gpacalculator?s=" + GP.encode(ws, onlyCur); copy(url, "Link copied: " + what); notice(url.length > 6000 ? "That link is " + url.length.toLocaleString() + " characters long; a few chat apps cut long links." : ""); }
	$("gp-link-all").onclick = function () { link(false, "everything"); };
	$("gp-link-one").onclick = function () { link(true, "this term"); };
	$("gp-copy").onclick = function () { var g = last && (last.all.gpa != null ? last.all.gpa : last.t.gpa); if (g != null) copy(GP.fix(g, 2), "Copied " + GP.fix(g, 2)); };
	document.querySelector("#gp .gp-print").onclick = function () { window.print(); };

	function renderAll() { renderTerms(); fillOpts(); renderRows(); update(); save(); }
	function loadOld(id) {
		notice("Loading the calculation from your shared link…");
		var f = window.fetch ? window.fetch("/api/share?calc=gpa&id=" + encodeURIComponent(id)).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); }) : Promise.reject(new Error("no fetch"));
		return f.then(function (d) { var w = GP.fromOldShare(d); if (!w) throw new Error("bad"); ws = normalise(w); notice(""); renderAll(); history.replaceState(null, "", "/gpacalculator"); toast("Shared GPA loaded"); })
			.catch(function () { notice("That old shared link could not be loaded (it may have expired). Here is your calculator &mdash; enter your grades above."); });
	}

	ws = load();
	var q = new URLSearchParams(location.search), m = location.pathname.match(/^\/gpacalculator\/s\/([A-Za-z0-9]+)\/?$/);
	if (q.get("s")) { var d = GP.decode(q.get("s")); if (d) { ws = normalise(d); notice("Opened a shared GPA sheet. It is saved in this browser now."); } else notice("That link could not be read."); history.replaceState(null, "", location.pathname); }
	renderAll();
	if (m && !q.get("s")) loadOld(m[1]);
	window.addEventListener("storage", function (e) { if (e.key !== KEY || (document.activeElement && root.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))) return; try { var s = JSON.parse(e.newValue); if (s && Array.isArray(s.terms)) { ws = normalise(s); renderAll(); } } catch (x) {} });
})();
