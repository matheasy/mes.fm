/* MES Weighted Average Calculator 2.0 -- mes.fm/weighted-average-calculator (UI; maths + share encoding in lib.js, global WA).
 * localStorage "mes-weighted-average:v1"; ?s=<encoded list> carries a list to another device; ?g=90,80&w=3,4 simple links.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("wa");
	if (!root || !window.WA) return;
	var KEY = "mes-weighted-average:v1";
	var EXAMPLES = [
		["Courses by credits", "Fall semester", [["Calculus", "91", "4"], ["Physics", "84", "4"], ["History", "78", "3"], ["English", "88", "3"], ["Art", "95", "2"]]],
		["Assignments by percent", "Biology", [["Quizzes", "88", "20"], ["Labs", "92", "25"], ["Midterm", "76", "25"], ["Final", "81", "30"]]]
	];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { title: "", dec: 2, rows: [] }, memOnly = false;
	function pad() { while (st.rows.length < 5) st.rows.push(WA.blankRow()); }
	function load() {
		try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && Array.isArray(s.rows)) { st.title = String(s.title || ""); st.dec = +s.dec >= 0 && +s.dec <= 4 ? +s.dec : 2; st.rows = s.rows.map(function (x) { return { n: String(x.n || ""), v: String(x.v || ""), w: String(x.w || "") }; }); } } catch (e) { memOnly = true; }
		pad();
	}
	function save() {
		try { localStorage.setItem(KEY, JSON.stringify(st)); memOnly = false; } catch (e) { memOnly = true; }
		$("wa-store-note").textContent = memOnly ? "Your browser is blocking storage, so this list will be lost when you close the tab. Copy a link to keep it." : "Saved in this browser.";
	}
	function toast(msg) {
		var t = $("wa-toast"); if (!t) { t = document.createElement("div"); t.id = "wa-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700);
	}
	function copy(text, msg) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb();
	}
	function notice(h) { var n = $("wa-notice"); n.innerHTML = h || ""; n.hidden = !h; }

	function rowHtml(x, i) {
		return '<div class="wa-row" data-i="' + i + '"><span class="wa-n">' + (i + 1) + '</span>' +
			'<div class="wa-f wa-f-n"><label>Name</label><input class="tu-input" data-k="n" type="text" maxlength="60" autocomplete="off" placeholder="optional" value="' + esc(x.n) + '"></div>' +
			'<div class="wa-f"><label>Grade</label><input class="tu-input" data-k="v" type="text" inputmode="decimal" autocomplete="off" value="' + esc(x.v) + '"></div>' +
			'<div class="wa-f"><label>Weight</label><input class="tu-input" data-k="w" type="text" inputmode="decimal" autocomplete="off" value="' + esc(x.w) + '"></div>' +
			'<button type="button" class="tu-btn tu-btn--ghost wa-del" title="Remove this row" aria-label="Remove row ' + (i + 1) + '">✕</button></div>';
	}
	function renderRows() { $("wa-rows").innerHTML = st.rows.map(rowHtml).join(""); }
	$("wa-rows").addEventListener("input", function (e) { var r = e.target.closest(".wa-row"); if (!r) return; st.rows[+r.dataset.i][e.target.dataset.k] = e.target.value; save(); update(); });
	$("wa-rows").addEventListener("click", function (e) {
		var b = e.target.closest(".wa-del"); if (!b) return; var i = +b.closest(".wa-row").dataset.i;
		if (st.rows.length > 1) st.rows.splice(i, 1); else st.rows[0] = WA.blankRow();
		pad(); save(); renderRows(); update();
	});
	$("wa-rows").addEventListener("keydown", function (e) {   // Enter moves down a column; on the last row it adds one
		if (e.key !== "Enter" || !e.target.dataset.k) return;
		e.preventDefault(); var r = e.target.closest(".wa-row"), next = r.nextElementSibling;
		if (!next) { st.rows.push(WA.blankRow()); save(); renderRows(); next = $("wa-rows").lastElementChild; }
		var inp = next.querySelector('[data-k="' + e.target.dataset.k + '"]'); if (inp) inp.focus();
	});
	$("wa-add").onclick = function () { st.rows.push(WA.blankRow()); save(); renderRows(); update(); var l = $("wa-rows").querySelector(".wa-row:last-child input"); if (l) l.focus(); };
	$("wa-equal").onclick = function () { var n = 0; st.rows.forEach(function (x) { if (WA.num(x.v) != null) { x.w = "1"; n++; } }); if (!n) { toast("Enter some grades first"); return; } save(); renderRows(); update(); toast("Every row now has weight 1"); };
	$("wa-clear").onclick = function () { var snap = JSON.stringify(st); st.title = ""; st.rows = []; pad(); save(); fillTitle(); renderRows(); update(); notice('List cleared. <button type="button" class="tu-chip" id="wa-undo">Undo</button>'); $("wa-undo").onclick = function () { st = JSON.parse(snap); save(); fillTitle(); renderRows(); update(); notice(""); }; };
	$("wa-title").addEventListener("input", function () { st.title = this.value; save(); });
	$("wa-dec").addEventListener("change", function () { st.dec = +this.value; save(); update(); });
	function fillTitle() { $("wa-title").value = st.title; $("wa-dec").value = String(st.dec); }

	// paste from a spreadsheet: [name] grade weight per line
	$("wa-paste").onclick = function () { $("wa-pastebox").hidden = false; $("wa-pastetext").focus(); };
	$("wa-pastecancel").onclick = function () { $("wa-pastebox").hidden = true; };
	$("wa-pastego").onclick = function () {
		var rows = [];
		$("wa-pastetext").value.split(/\r?\n/).forEach(function (line) {
			line = line.trim(); if (!line) return;
			var parts = line.indexOf("\t") >= 0 ? line.split("\t") : /[;]/.test(line) ? line.split(";") : line.indexOf(",") >= 0 && line.split(",").length >= 2 && !/^\s*-?\d+,\d{1,2}\s*$/.test(line) ? line.split(",") : line.split(/\s+/);
			parts = parts.map(function (p) { return p.trim(); }).filter(function (p, i, a) { return p !== "" || i < a.length; });
			var nums = parts.filter(function (p) { return WA.num(p) != null; });
			if (nums.length < 2) return;
			var name = parts.filter(function (p) { return WA.num(p) == null; }).join(" ");
			rows.push({ n: name.slice(0, 60), v: String(nums[nums.length - 2]), w: String(nums[nums.length - 1]) });
		});
		if (!rows.length) { toast("No rows with a grade and a weight found"); return; }
		var n = rows.length; st.rows = rows; pad(); save(); renderRows(); update(); $("wa-pastebox").hidden = true; $("wa-pastetext").value = ""; toast("Loaded " + n + (n === 1 ? " row" : " rows"));
	};

	$("wa-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("wa-examples").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return; var ex = EXAMPLES[+b.dataset.i];
		st.title = ex[1]; st.rows = ex[2].map(function (r) { return { n: r[0], v: r[1], w: r[2] }; }); pad(); save(); fillTitle(); renderRows(); update();
	});

	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var last = null;
	function update() {
		var R = WA.compute(st.rows), d = st.dec; last = R;
		var ok = R.avg != null; $("wa-empty").hidden = ok || R.used > 0 && R.sumW > 0; $("wa-out").hidden = !ok;
		if (!ok) { if (R.warn || R.skipped) { $("wa-empty").hidden = false; } return; }
		$("wa-hero").innerHTML = stat("Weighted average", WA.fix(R.avg, d), "weights counted: " + WA.fix(R.sumW, 4, true), "tu-stat--hero") +
			stat("Plain average", WA.fix(R.simple, d), "every row counted equally") +
			stat("Rows used", String(R.used), R.skipped ? R.skipped + " row" + (R.skipped > 1 ? "s" : "") + " skipped: a grade needs a weight and a weight needs a grade" : "") +
			stat("Total weight", WA.fix(R.sumW, 4, true), "sum of all the weights");
		var h = "<thead><tr><th>#</th><th>Name</th><th>Grade</th><th>Weight</th><th>Share of total</th><th>Grade &times; weight</th></tr></thead><tbody>" +
			R.rows.map(function (r) { var x = st.rows[r.i]; return "<tr><td>" + (r.i + 1) + "</td><td>" + esc(x.n) + "</td><td>" + WA.fix(r.v, 4, true) + "</td><td>" + WA.fix(r.w, 4, true) + "</td><td>" + WA.fix(r.share, 1) + "%</td><td>" + WA.fix(r.v * r.w, 4, true) + "</td></tr>"; }).join("") +
			"<tr class=\"wa-total\"><td></td><td>Total</td><td></td><td>" + WA.fix(R.sumW, 4, true) + "</td><td>100%</td><td>" + WA.fix(R.sumVW, 4, true) + "</td></tr></tbody>";
		$("wa-table").innerHTML = h;
		$("wa-formula").innerHTML = "Weighted average = " + WA.fix(R.sumVW, 4, true) + " &divide; " + WA.fix(R.sumW, 4, true) + " = <b>" + WA.fix(R.avg, d) + "</b>" + (R.warn ? ' &middot; <span class="wa-warn">' + esc(R.warn) + "</span>" : "");
	}
	$("wa-copy").onclick = function () { if (last && last.avg != null) copy(WA.fix(last.avg, st.dec), "Copied " + WA.fix(last.avg, st.dec)); };
	$("wa-csv").onclick = function () {
		if (!last) return; var lines = ["Name\tGrade\tWeight"];
		last.rows.forEach(function (r) { lines.push((st.rows[r.i].n || "") + "\t" + r.v + "\t" + r.w); });
		lines.push("Weighted average\t" + WA.fix(last.avg, st.dec) + "\t" + WA.fix(last.sumW, 4, true)); copy(lines.join("\n"), "Copied: paste it into a spreadsheet");
	};
	$("wa-link").onclick = function () {
		var url = location.origin + "/weighted-average-calculator?s=" + WA.encode(st.rows, st.title);
		copy(url, "Link copied: paste it on any device"); notice(url.length > 6000 ? "That link is " + url.length.toLocaleString() + " characters long; a few chat apps cut long links." : "");
	};
	document.querySelector("#wa .wa-print").onclick = function () { window.print(); };

	load(); fillTitle();
	var q = new URLSearchParams(location.search);
	if (q.get("s")) { var d = WA.decode(q.get("s")); if (d) { st.title = d.title; st.rows = d.rows; save(); notice("Opened a shared list. It is saved in this browser now."); } else notice("That link could not be read."); history.replaceState(null, "", location.pathname); }
	else if (q.get("g") || q.get("w")) { st.rows = WA.fromLists(q.get("g"), q.get("w")); save(); history.replaceState(null, "", location.pathname); }
	fillTitle(); renderRows(); save(); update();
})();
