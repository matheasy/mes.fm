/* MES Grade Calculator -- pure maths + share encoding (no DOM). Runs in the browser (global `GC`) and in node:
 *   const GC = require('./tool_apps_src/gradecalculator/lib.js');   tests: node tool_apps_src/gradecalculator-tests.js
 *
 * A course = { name, target, mode: "known" | "items", cur, fw, rows: [{ n (name), s (score), o (out of), w (weight %) }] }.
 *   known: the person types their current grade and the final exam's weight.
 *   items: the current grade is the weighted average of the graded rows; the remaining weight = 100 - the weights of the graded rows
 *          (a row with a weight but no score yet is "still to come": it stays inside the remaining weight).
 * Needed average on the remaining work = (target - sum(w*g)/100) / (remaining/100) * 100.
 */
(function (root) {
	"use strict";

	/* ---------- numbers ---------- */
	// "82.5", "82,5", " 82.5 % " -> 82.5 ; anything else -> null
	function num(v) {
		if (v == null) return null;
		var t = String(v).trim().replace(/%/g, "").replace(/\s+/g, "");
		if (t === "") return null;
		if (/^-?\d+,\d{1,2}$/.test(t)) t = t.replace(",", ".");          // decimal comma
		else t = t.replace(/,/g, "");                                       // thousands commas
		if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
		var n = parseFloat(t);
		return isFinite(n) ? n : null;
	}
	function r(n, d) { var k = Math.pow(10, d == null ? 6 : d); return Math.round(n * k) / k; }
	// fixed decimals; trim = drop a trailing ".00" / ".0"
	function fix(n, d, trim) {
		if (n == null || !isFinite(n)) return "";
		var s = (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
		if (Object.is(parseFloat(s), -0)) s = (0).toFixed(d);
		return trim ? s.replace(/\.?0+$/, "") : s;
	}

	/* ---------- one assignment ---------- */
	// grade % of a row: score / out-of * 100 ; null if either is missing or out-of is not positive
	function gradeOf(row) {
		var s = num(row.s), o = num(row.o);
		if (s == null || o == null || o <= 0) return null;
		return s / o * 100;
	}

	/* ---------- one course ---------- */
	function blankRow() { return { n: "", s: "", o: "", w: "" }; }
	function blankCourse(name) {
		var rows = []; for (var i = 0; i < 5; i++) rows.push(blankRow());
		return { name: name || "My course", target: "80", mode: "known", cur: "", fw: "", rows: rows };
	}

	// -> { status, current, graded, pending, usedW, remaining, base, min, max, target, needed, warn[] }
	// status: "incomplete" (something missing), "ok" (0 <= needed <= 100), "secure" (needed <= 0), "impossible" (needed > 100),
	//         "nofinal" (nothing left to earn: remaining weight is 0), "over" (the weights add up to more than 100)
	function compute(c) {
		var out = { status: "incomplete", current: null, usedW: null, remaining: null, base: null, min: null, max: null, needed: null,
			target: num(c.target), graded: 0, pending: 0, warn: [] };
		if (c.mode === "items") {
			var sumW = 0, sumWG = 0, pendW = 0, anyW = false;
			(c.rows || []).forEach(function (row) {
				var w = num(row.w), g = gradeOf(row);
				if (w != null && w < 0) { out.warn.push("A weight is negative."); return; }
				if (g != null && w != null && w > 0) { sumW += w; sumWG += w * g; out.graded++; anyW = true; }
				else if (g != null && (w == null || w === 0)) { out.warn.push("A graded row has no weight, so it is not counted."); }
				else if (g == null && w != null && w > 0) { pendW += w; out.pending++; }
			});
			out.usedW = r(sumW);
			out.remaining = r(100 - sumW);
			out.current = anyW ? sumWG / sumW : null;
			out.base = sumWG / 100;               // points already banked towards the course grade
			if (!anyW) return out;
		} else {
			var cur = num(c.cur), fw = num(c.fw);
			if (cur == null || fw == null) return out;
			if (fw < 0 || fw > 100) { out.warn.push("The final exam's weight must be between 0 and 100."); return out; }
			out.current = cur; out.remaining = fw; out.usedW = r(100 - fw); out.base = cur * (100 - fw) / 100;
		}
		out.min = out.base;
		out.max = out.base + Math.max(0, out.remaining);
		if (out.remaining < -1e-9) { out.status = "over"; return out; }
		if (out.target == null) return out;
		if (out.remaining <= 1e-9) { out.status = "nofinal"; return out; }
		out.needed = (out.target - out.base) / out.remaining * 100;
		out.status = out.needed <= 1e-9 ? "secure" : out.needed > 100 + 1e-9 ? "impossible" : "ok";
		return out;
	}

	// what-if: the course grade if the remaining work averages `score` %
	function courseGrade(res, score) { return res.base + Math.max(0, res.remaining) * score / 100; }
	// needed average on the remaining work for any target
	function neededFor(res, target) { return (target - res.base) / res.remaining * 100; }

	/* ---------- letter grades (common US 4.0 scale, just a label) ---------- */
	var LETTERS = [[97, "A+"], [93, "A"], [90, "A-"], [87, "B+"], [83, "B"], [80, "B-"], [77, "C+"], [73, "C"], [70, "C-"], [67, "D+"], [63, "D"], [60, "D-"], [0, "F"]];
	function letter(g) { if (g == null) return ""; for (var i = 0; i < LETTERS.length; i++) if (g >= LETTERS[i][0] - 1e-9) return LETTERS[i][1]; return "F"; }

	/* ---------- spreading the weights ---------- */
	// the rows' weights become equal and add up to 100 - finalWeight
	function evenWeights(c, finalWeight) {
		var rows = c.rows.filter(function (x) { return num(x.s) != null || num(x.o) != null || (x.n || "").trim() || num(x.w) != null; });
		if (!rows.length) return 0;
		var each = (100 - finalWeight) / rows.length;
		rows.forEach(function (x) { x.w = fix(each, 2, true); });
		return rows.length;
	}

	/* ---------- sharing: the whole workspace as one URL-safe string ---------- */
	function b64e(str) {
		var b = typeof Buffer !== "undefined" ? Buffer.from(str, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(str)));
		return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	}
	function b64d(s) {
		s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
		return typeof Buffer !== "undefined" ? Buffer.from(s, "base64").toString("utf8") : decodeURIComponent(escape(atob(s)));
	}
	function cleanRows(rows) {   // drop trailing empty rows, keep order
		var o = (rows || []).map(function (x) { return [x.n || "", x.s || "", x.o || "", x.w || ""]; });
		while (o.length && !o[o.length - 1].join("")) o.pop();
		return o;
	}
	// workspace {courses:[...], cur:index} -> "v1~..." ; arrays keep it short
	function encode(courses, cur) {
		var arr = courses.map(function (c) { return [c.name || "", c.target || "", c.mode === "items" ? 1 : 0, c.cur || "", c.fw || "", cleanRows(c.rows)]; });
		return "1" + b64e(JSON.stringify([cur || 0, arr]));
	}
	function decode(s) {
		try {
			s = String(s || "");
			if (s.charAt(0) !== "1") return null;
			var j = JSON.parse(b64d(s.slice(1)));
			if (!Array.isArray(j) || !Array.isArray(j[1])) return null;
			var courses = j[1].slice(0, 40).map(function (a) {
				var rows = (Array.isArray(a[5]) ? a[5] : []).slice(0, 200).map(function (x) { return { n: String(x[0] || "").slice(0, 60), s: String(x[1] || "").slice(0, 12), o: String(x[2] || "").slice(0, 12), w: String(x[3] || "").slice(0, 12) }; });
				while (rows.length < 5) rows.push(blankRow());
				return { name: String(a[0] || "Course").slice(0, 60), target: String(a[1] || "").slice(0, 8), mode: a[2] ? "items" : "known", cur: String(a[3] || "").slice(0, 10), fw: String(a[4] || "").slice(0, 10), rows: rows };
			});
			var cur = +j[0]; if (!(cur >= 0 && cur < courses.length)) cur = 0;
			return courses.length ? { courses: courses, cur: cur } : null;
		} catch (e) { return null; }
	}

	/* ---------- the 2013-2025 /gradecalculator/s/<id> links ---------- */
	// stored {desired, current, weight} (current grade known) or {desired, ass: [[score, outOf, weight], ...]} (rows of .saved-input values)
	function fromOldShare(d) {
		if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return null; } }
		if (!d || typeof d !== "object") return null;
		var c = blankCourse("Shared course");
		if (d.desired != null && isFinite(d.desired)) c.target = String(d.desired);
		if (Array.isArray(d.ass)) {
			c.mode = "items";
			var rows = d.ass.filter(Array.isArray).map(function (a) { return { n: "", s: a[0] == null ? "" : String(a[0]), o: a[1] == null ? "" : String(a[1]), w: a[2] == null ? "" : String(a[2]) }; });
			if (!rows.length) return null;
			while (rows.length < 5) rows.push(blankRow());
			c.rows = rows;
			return c;
		}
		if (d.current == null || d.weight == null || !isFinite(d.current) || !isFinite(d.weight)) return null;
		c.cur = String(d.current); c.fw = String(d.weight);
		return c;
	}

	var GC = { num: num, fix: fix, r: r, gradeOf: gradeOf, blankRow: blankRow, blankCourse: blankCourse, compute: compute, courseGrade: courseGrade, neededFor: neededFor,
		letter: letter, LETTERS: LETTERS, evenWeights: evenWeights, encode: encode, decode: decode, fromOldShare: fromOldShare };
	if (typeof module !== "undefined" && module.exports) module.exports = GC; else root.GC = GC;
})(typeof window !== "undefined" ? window : globalThis);

/* MES Grade Calculator 2.0 -- mes.fm/gradecalculator (UI; maths + share encoding are in lib.js, global GC).
 * Courses live in localStorage "mes-gradecalculator:v1". A link ?s=<encoded courses> carries them to another device; the old
 * /gradecalculator/s/<id> links still resolve through /api/share?calc=gc. Simple links also work: ?target=80&current=78&weight=40.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("gc");
	if (!root || !window.GC) return;
	var KEY = "mes-gradecalculator:v1";
	var TARGETS = [50, 60, 70, 80, 90, 95];
	var EXAMPLES = [
		["78% now, final worth 40%", { name: "Calculus 101", target: "80", mode: "known", cur: "78", fw: "40" }],
		["Mid-term, quiz, lab, essay", { name: "Biology", target: "85", mode: "items", rows: [["Quiz 1", "17", "20", "10"], ["Lab report", "42", "50", "15"], ["Midterm", "68", "80", "25"], ["Essay", "", "", "10"]] }]
	];

	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
	function pct(n, d) { return GC.fix(n, d == null ? 2 : d) + "%"; }

	/* ---------- state ---------- */
	var ws, memOnly = false;
	function newCourse(name) { var c = GC.blankCourse(name); c.id = uid(); return c; }
	function normaliseCourse(c) {
		c.id = c.id || uid(); c.name = String(c.name == null ? "Course" : c.name); c.target = String(c.target == null ? "" : c.target);
		c.mode = c.mode === "items" ? "items" : "known"; c.cur = String(c.cur || ""); c.fw = String(c.fw || "");
		if (!Array.isArray(c.rows)) c.rows = [];
		c.rows = c.rows.map(function (x) { return { n: String(x.n || ""), s: String(x.s || ""), o: String(x.o || ""), w: String(x.w || "") }; });
		if (!c.rows.length) while (c.rows.length < 5) c.rows.push(GC.blankRow());
		return c;
	}
	function load() {
		try {
			var s = JSON.parse(localStorage.getItem(KEY) || "null");
			if (s && Array.isArray(s.courses) && s.courses.length) { s.courses = s.courses.map(normaliseCourse); if (!find(s, s.cur)) s.cur = s.courses[0].id; return s; }
		} catch (e) { memOnly = true; }
		var c = newCourse("My course");
		return { courses: [c], cur: c.id };
	}
	function find(w, id) { for (var i = 0; i < w.courses.length; i++) if (w.courses[i].id === id) return w.courses[i]; return null; }
	function course() { return find(ws, ws.cur); }
	function save() {
		try { localStorage.setItem(KEY, JSON.stringify(ws)); memOnly = false; } catch (e) { memOnly = true; }
		var n = $("gc-store-note");
		n.textContent = memOnly ? "Your browser is blocking storage, so your courses will be lost when you close this tab. Copy a link or download a backup to keep them."
			: ws.courses.length + (ws.courses.length === 1 ? " course" : " courses") + " saved in this browser.";
		n.classList.toggle("gc-warn", memOnly);
	}
	function isBlank(c) { return !c.cur && !c.fw && c.name === "My course" && c.rows.every(function (x) { return !x.n && !x.s && !x.o && !x.w; }); }

	/* ---------- toast / copy / notice ---------- */
	function toast(msg) {
		var t = $("gc-toast");
		if (!t) { t = document.createElement("div"); t.id = "gc-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show");
		clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700);
	}
	function copy(text, msg) {
		function fallback() {
			var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0";
			document.body.appendChild(ta); ta.select();
			try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); }
			document.body.removeChild(ta);
		}
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fallback); else fallback();
	}
	function notice(html) { var n = $("gc-notice"); n.innerHTML = html || ""; n.hidden = !html; }

	/* ---------- course tabs ---------- */
	function renderCourses() {
		$("gc-courses").innerHTML = ws.courses.map(function (c) {
			return '<button type="button" role="tab" class="gc-tab" data-id="' + c.id + '" aria-selected="' + (c.id === ws.cur) + '">' + esc(c.name || "Untitled") + "</button>";
		}).join("") + '<button type="button" class="gc-tab gc-tab--add" id="gc-addcourse">+ Course</button>' +
			'<details class="gc-menu" id="gc-menu"><summary class="tu-btn tu-btn--ghost">⋯</summary><div class="gc-menu-box">' +
			'<button type="button" data-act="dup">⧉ Duplicate this course</button>' +
			'<button type="button" data-act="reset">↺ Clear this course</button>' +
			'<button type="button" data-act="del" class="gc-danger">🗑 Delete this course</button></div></details>';
	}
	$("gc-courses").addEventListener("click", function (e) {
		if (e.target.closest("#gc-addcourse")) {
			var c = newCourse(ws.courses.length ? "Course " + (ws.courses.length + 1) : "My course"); ws.courses.push(c); ws.cur = c.id; save(); renderAll(); $("gc-name").select(); return;
		}
		var t = e.target.closest(".gc-tab"); if (t && t.dataset.id) { ws.cur = t.dataset.id; save(); renderAll(); return; }
		var b = e.target.closest("button[data-act]"); if (!b) return;
		var a = b.dataset.act, c = course(), menu = $("gc-menu"); if (menu) menu.open = false;
		if (a === "dup") { var d = JSON.parse(JSON.stringify(c)); d.id = uid(); d.name = c.name + " (copy)"; ws.courses.splice(ws.courses.indexOf(c) + 1, 0, d); ws.cur = d.id; save(); renderAll(); toast("Duplicated"); }
		else if (a === "reset") { var snap = JSON.stringify(ws); var f = GC.blankCourse(c.name); f.id = c.id; ws.courses[ws.courses.indexOf(c)] = f; save(); renderAll(); undoToast("Course cleared", snap); }
		else if (a === "del") {
			var snap2 = JSON.stringify(ws), i = ws.courses.indexOf(c);
			ws.courses.splice(i, 1);
			if (!ws.courses.length) ws.courses.push(newCourse("My course"));
			ws.cur = ws.courses[Math.min(i, ws.courses.length - 1)].id; save(); renderAll(); undoToast("Course deleted", snap2);
		}
	});
	document.addEventListener("click", function (e) { var m = $("gc-menu"); if (m && m.open && !m.contains(e.target)) m.open = false; });
	function undoToast(msg, snap) {
		var t = $("gc-toast");
		if (!t) { toast(msg); t = $("gc-toast"); }
		t.innerHTML = esc(msg) + ' <button type="button" class="gc-undo">Undo</button>'; t.classList.add("tu-toast--show");
		t.querySelector(".gc-undo").onclick = function () { try { ws = JSON.parse(snap); ws.courses = ws.courses.map(normaliseCourse); } catch (e) {} save(); renderAll(); t.classList.remove("tu-toast--show"); };
		clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 6000);
	}

	/* ---------- setup (fields) ---------- */
	function fillSetup() {
		var c = course();
		$("gc-name").value = c.name; $("gc-target").value = c.target; $("gc-cur").value = c.cur; $("gc-fw").value = c.fw;
		[].forEach.call($("gc-mode").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.mode === c.mode)); });
		$("gc-known").hidden = c.mode !== "known"; $("gc-items").hidden = c.mode !== "items";
		syncTargets();
	}
	function syncTargets() {
		var t = GC.num(course().target);
		$("gc-targets").innerHTML = TARGETS.map(function (n) { return '<button type="button" class="tu-chip" data-t="' + n + '" aria-pressed="' + (t === n) + '">' + n + "% <small>" + GC.letter(n) + "</small></button>"; }).join("");
	}
	$("gc-targets").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; course().target = b.dataset.t; $("gc-target").value = b.dataset.t; syncTargets(); save(); update(); });
	$("gc-name").addEventListener("input", function () { course().name = this.value; var t = $("gc-courses").querySelector('.gc-tab[data-id="' + ws.cur + '"]'); if (t) t.textContent = this.value || "Untitled"; save(); update(); });
	[["gc-target", "target"], ["gc-cur", "cur"], ["gc-fw", "fw"]].forEach(function (p) {
		$(p[0]).addEventListener("input", function () { course()[p[1]] = this.value; if (p[1] === "target") syncTargets(); save(); update(); });
	});
	$("gc-mode").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		var c = course(); if (c.mode === b.dataset.mode) return;
		c.mode = b.dataset.mode; save(); fillSetup(); if (c.mode === "items") renderRows(); update();
		if (c.mode === "items" && window.matchMedia("(max-width: 700px)").matches) { $("gc-items").scrollIntoView({ behavior: "smooth", block: "start" }); }   // the table appears below the switch: bring it into view on a phone
	});

	/* ---------- assignment rows ---------- */
	function rowHtml(x, i) {
		var g = GC.gradeOf(x);
		return '<div class="gc-row rw-row" data-i="' + i + '"><span class="gc-n rw-num">' + (i + 1) + '.</span>' +
			'<div class="gc-f rw-f rw-name gc-f-n"><label>Name</label><input class="tu-input" data-k="n" type="text" maxlength="60" autocomplete="off" placeholder="' + (i === 0 ? "e.g. Midterm" : "Assignment " + (i + 1)) + '" value="' + esc(x.n) + '"></div>' +
			'<div class="gc-f rw-f gc-f-s"><label>Score</label><input class="tu-input" data-k="s" type="text" inputmode="decimal" autocomplete="off" value="' + esc(x.s) + '"></div>' +
			'<div class="gc-f rw-f gc-f-o"><label>Out of</label><input class="tu-input" data-k="o" type="text" inputmode="decimal" autocomplete="off" value="' + esc(x.o) + '"></div>' +
			'<div class="gc-f rw-f gc-f-g"><label>Grade %</label><input class="tu-input" data-k="g" type="text" inputmode="decimal" autocomplete="off" value="' + (g == null ? "" : GC.fix(g, 1, true)) + '"></div>' +
			'<div class="gc-f rw-f gc-f-w"><label>Weight %</label><input class="tu-input" data-k="w" type="text" inputmode="decimal" autocomplete="off" value="' + esc(x.w) + '"></div>' +
			'<button type="button" class="tu-btn tu-btn--ghost gc-del rw-del" title="Remove this row" aria-label="Remove this row">✕</button></div>';
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
	function renderRows() { $("gc-rows").innerHTML = course().rows.map(rowHtml).join(""); rwDecorate($("gc-rows")); }
	rwBar($("gc-rows"), renderRows);
	$("gc-rows").addEventListener("input", function (e) {
		var row = e.target.closest(".gc-row"); if (!row) return;
		var c = course(), x = c.rows[+row.dataset.i], k = e.target.dataset.k, v = e.target.value;
		if (k === "g") {   // typing the grade directly: keep score / out-of consistent (out of 100 when it was empty)
			var g = GC.num(v);
			if (g == null) { x.s = ""; if (!GC.num(x.o)) x.o = ""; }
			else { var o = GC.num(x.o); if (!(o > 0)) { o = 100; x.o = "100"; } x.s = GC.fix(o * g / 100, 2, true); }
			row.querySelector('[data-k="s"]').value = x.s; row.querySelector('[data-k="o"]').value = x.o;
		} else {
			x[k] = v;
			var g2 = GC.gradeOf(x); row.querySelector('[data-k="g"]').value = g2 == null ? "" : GC.fix(g2, 1, true);
		}
		save(); update();
	});
	$("gc-rows").addEventListener("click", function (e) {
		var b = e.target.closest(".gc-del"); if (!b) return;
		var c = course(), i = +b.closest(".gc-row").dataset.i;
		if (c.rows.length > 1) c.rows.splice(i, 1); else c.rows[0] = GC.blankRow();
		save(); renderRows(); update();
	});
	$("gc-add").onclick = function () {
		var c = course(); c.rows.push(GC.blankRow()); save(); renderRows(); update();
		var last = $("gc-rows").querySelector(".gc-row:last-child input"); if (last) last.focus();
	};
	$("gc-even").onclick = function () {
		var v = prompt("What does the final exam count for (%)? Every row will get the same weight, adding up to the rest.", "40");
		if (v == null) return; var fw = GC.num(v);
		if (fw == null || fw < 0 || fw >= 100) { toast("Enter a number from 0 to 99"); return; }
		var n = GC.evenWeights(course(), fw); if (!n) { toast("Fill in some rows first"); return; }
		save(); renderRows(); update(); toast("Gave " + n + " rows an equal weight");
	};
	$("gc-clearrows").onclick = function () {
		var c = course(); c.rows.forEach(function (x) { x.s = ""; x.o = ""; });
		save(); renderRows(); update(); toast("Scores cleared (names and weights kept)");
	};

	/* ---------- results ---------- */
	function stat(label, value, sub, cls) { return '<div class="tu-stat' + (cls ? " " + cls : "") + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value">' + value + '</div><div class="tu-stat__sub">' + sub + "</div></div>"; }
	function update() {
		var c = course(), R = GC.compute(c), items = c.mode === "items";
		// the items summary line
		if (items) {
			var parts = [];
			if (R.usedW != null) parts.push("Graded so far: <b>" + GC.fix(R.usedW, 2, true) + "%</b> of the course");
			if (R.remaining != null) parts.push((R.pending ? "still to come: " : "final exam: ") + "<b>" + GC.fix(R.remaining, 2, true) + "%</b>");
			if (R.current != null) parts.push("current grade <b>" + pct(R.current) + "</b>");
			$("gc-summary").innerHTML = parts.join(" &middot; ") + (R.warn.length ? '<br><span class="gc-warn">' + esc(R.warn[0]) + "</span>" : "");
			$("gc-summary").classList.toggle("is-over", R.status === "over");
		}
		var show = R.status !== "incomplete" && R.min != null;
		$("gc-empty").hidden = show; $("gc-out").hidden = !show;
		var ov = $("gc-overview-card"); ov.hidden = ws.courses.length < 2; if (!ov.hidden) renderOverview();
		if (!show) return;
		var what = R.pending && items ? "everything still to come" : "the final exam", whatS = R.pending && items ? "what is still to come" : "the final";
		var heroV, heroSub, cls = "tu-stat--hero", v = "";
		if (R.status === "ok") { heroV = pct(R.needed); heroSub = "needed on " + whatS + " to finish with " + pct(R.target, 2).replace(/\.00%$/, "%") + " (" + GC.letter(R.target) + ")"; }
		else if (R.status === "secure") { heroV = "Already safe"; heroSub = "you can score 0% on " + whatS + " and still reach " + pct(R.target, 2).replace(/\.00%$/, "%"); }
		else if (R.status === "impossible") { heroV = '<span class="tu-neg">' + pct(R.needed) + "</span>"; heroSub = "needed: more than 100%, so " + pct(R.target, 2).replace(/\.00%$/, "%") + " is out of reach"; }
		else if (R.status === "nofinal") { heroV = pct(R.current); heroSub = "nothing is left to earn: this is your course grade"; }
		else { heroV = "–"; heroSub = "the weights add up to more than 100%"; }
		$("gc-hero").innerHTML = stat("Needed on " + (R.pending && items ? "what is left" : "the final"), heroV, heroSub, cls) +
			stat("Current grade", R.current == null ? "–" : pct(R.current), R.current == null ? "" : GC.letter(R.current) + " on the common US scale") +
			stat("Still to earn", R.remaining == null ? "–" : GC.fix(Math.max(0, R.remaining), 2, true) + "%", "of the course grade is on the line") +
			stat("Course grade range", pct(R.min, 1).replace(/\.0%/, "%") + " to " + pct(R.max, 1).replace(/\.0%/, "%"), "from 0% to 100% on " + whatS);
		// verdict sentence
		var T = R.target == null ? "" : pct(R.target, 2).replace(/\.00%$/, "%"), vd = "";
		if (R.status === "ok") vd = "You need <b>" + pct(R.needed) + "</b> on " + what + " to finish with <b>" + T + "</b> in the course." + (R.needed > 90 ? " That is a stretch, so check what a slightly lower target would need in the table below." : R.needed < 50 ? " That is a comfortable margin." : "");
		else if (R.status === "secure") vd = "Good news: even <b>0%</b> on " + what + " still gives you at least <b>" + T + "</b>. Your lowest possible course grade is <b>" + pct(R.min) + "</b>.";
		else if (R.status === "impossible") vd = "You would need <b>" + pct(R.needed) + "</b> on " + what + " to finish with " + T + ", which is more than 100%, so that target is out of reach. The most you can finish with is <b>" + pct(R.max) + "</b>.";
		else if (R.status === "nofinal") vd = "The weights you entered cover the whole course, so there is nothing left to earn. Your course grade is <b>" + pct(R.current) + "</b>.";
		else if (R.status === "over") vd = '<span class="gc-warn">The weights add up to ' + GC.fix(R.usedW, 2, true) + "%, which is more than 100%. Lower some weights so there is room for the final exam.</span>";
		else vd = "Enter the grade you want in the course to see what you need.";
		$("gc-verdict").innerHTML = vd;
		$("gc-verdict").className = "tu-card gc-verdict" + (R.status === "ok" ? " is-ok" : R.status === "secure" ? " is-good" : R.status === "impossible" || R.status === "over" ? " is-bad" : "");
		var canTarget = R.status !== "over" && R.remaining > 0;
		$("gc-meter-card").hidden = !canTarget; $("gc-whatif").hidden = !canTarget;
		$("gc-table-card").hidden = !canTarget; var h2 = $("gc-table-card").previousElementSibling; if (h2) h2.hidden = !canTarget;
		if (canTarget) { renderMeter(R); renderWhatIf(R); renderTable(R); }
	}
	function renderMeter(R) {
		var lo = Math.max(0, Math.min(100, R.min)), hi = Math.max(0, Math.min(100, R.max)), T = R.target;
		var h = '<div class="gc-track"><div class="gc-range" style="left:' + lo + "%;width:" + Math.max(0.5, hi - lo) + '%"></div>';
		if (R.current != null) h += '<div class="gc-mark gc-mark--cur" style="left:' + Math.max(0, Math.min(100, R.current)) + '%"><span>now</span></div>';
		if (T != null) h += '<div class="gc-mark gc-mark--tgt" style="left:' + Math.max(0, Math.min(100, T)) + '%"><span>goal</span></div>';
		h += '</div><div class="gc-scale"><span>0%</span><span>50%</span><span>100%</span></div>';
		$("gc-meter").innerHTML = h;
		$("gc-meter-note").textContent = "The shaded part is every course grade you can still reach: " + pct(R.min, 1).replace(/\.0%/, "%") + " if you score 0% on what is left, " + pct(R.max, 1).replace(/\.0%/, "%") + " if you score 100%.";
	}
	function renderWhatIf(R) {
		var el = $("gc-wi"), s = GC.num(el.value);
		if (s == null) { $("gc-wi-out").innerHTML = "Type a score, or move the slider, to see your final course grade."; return; }
		var g = GC.courseGrade(R, s);
		$("gc-wi-out").innerHTML = "Scoring <b>" + GC.fix(s, 2, true) + "%</b> on " + (course().mode === "items" && R.pending ? "what is left" : "the final") + " gives a course grade of <b>" + pct(g) + "</b> (" + GC.letter(g) + ")" + (R.target != null ? (g + 1e-9 >= R.target ? ' <span class="tu-pos">&#10003; goal reached</span>' : ' <span class="tu-neg">&#10007; short of ' + pct(R.target, 2).replace(/\.00%$/, "%") + "</span>") : "") + ".";
	}
	$("gc-wi").addEventListener("input", function () { var n = GC.num(this.value); if (n != null) $("gc-wi-r").value = Math.max(0, Math.min(100, n)); update(); });
	$("gc-wi-r").addEventListener("input", function () { $("gc-wi").value = this.value; update(); });
	function renderTable(R) {
		var targets = [], t;
		for (t = 40; t <= 100; t += 5) targets.push(t);
		if (R.target != null && R.target >= 0 && R.target <= 100 && targets.indexOf(R.target) < 0) { targets.push(R.target); targets.sort(function (a, b) { return a - b; }); }
		var rows = targets.map(function (t) {
			var need = GC.neededFor(R, t), cell, cls = "";
			if (need <= 1e-9) { cell = "already safe"; cls = "gc-safe"; }
			else if (need > 100 + 1e-9) { cell = "out of reach"; cls = "gc-no"; }
			else cell = pct(need);
			return '<tr' + (R.target === t ? ' class="gc-sel"' : "") + "><td>" + GC.fix(t, 2, true) + "% <small>" + GC.letter(t) + "</small></td><td class=\"" + cls + '">' + cell + "</td></tr>";
		}).join("");
		$("gc-table").innerHTML = "<thead><tr><th>Grade I want in the course</th><th>Needed on " + (course().mode === "items" && R.pending ? "what is left" : "the final") + "</th></tr></thead><tbody>" + rows + "</tbody>";
	}
	function renderOverview() {
		var tot = 0, n = 0;
		var rows = ws.courses.map(function (c) {
			var R = GC.compute(c), need = "", cls = "";
			if (R.status === "ok") need = pct(R.needed); else if (R.status === "secure") { need = "already safe"; cls = "gc-safe"; } else if (R.status === "impossible") { need = "out of reach"; cls = "gc-no"; } else if (R.status === "nofinal") need = "nothing left"; else need = "–";
			if (R.current != null) { tot += R.current; n++; }
			return '<tr class="gc-orow' + (c.id === ws.cur ? " gc-sel" : "") + '" data-id="' + c.id + '" tabindex="0"><td>' + esc(c.name || "Untitled") + "</td><td>" + (R.current == null ? "–" : pct(R.current)) + "</td><td>" + (R.target == null ? "–" : GC.fix(R.target, 2, true) + "%") + '</td><td class="' + cls + '">' + need + "</td></tr>";
		}).join("");
		$("gc-overview").innerHTML = "<thead><tr><th>Course</th><th>Current</th><th>Goal</th><th>Needed on the final</th></tr></thead><tbody>" + rows + "</tbody>";
		$("gc-overview-note").innerHTML = (n ? "Average of your current grades: <b>" + pct(tot / n) + "</b>. " : "") + 'Click a row to open that course. For credit-weighted averages use the <a href="/gpacalculator">GPA Calculator</a>.';
	}
	$("gc-overview").addEventListener("click", function (e) { var r = e.target.closest(".gc-orow"); if (r) { ws.cur = r.dataset.id; save(); renderAll(); window.scrollTo({ top: root.getBoundingClientRect().top + window.scrollY - 60, behavior: "smooth" }); } });
	$("gc-overview").addEventListener("keydown", function (e) { if (e.key === "Enter") { var r = e.target.closest(".gc-orow"); if (r) r.click(); } });

	/* ---------- examples ---------- */
	$("gc-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("gc-examples").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		var ex = EXAMPLES[+b.dataset.i][1], c = course();
		c.name = ex.name; c.target = ex.target; c.mode = ex.mode; c.cur = ex.cur || ""; c.fw = ex.fw || "";
		c.rows = (ex.rows || []).map(function (r) { return { n: r[0], s: r[1], o: r[2], w: r[3] }; }); while (c.rows.length < 5) c.rows.push(GC.blankRow());
		save(); renderAll();
	});

	/* ---------- save and share ---------- */
	function linkFor(courses, cur) { return location.origin + "/gradecalculator?s=" + GC.encode(courses, cur); }
	function copyLink(courses, cur, what) {
		var url = linkFor(courses, cur);
		copy(url, "Link copied: " + what);
		if (url.length > 6000) notice("That link is " + url.length.toLocaleString() + " characters long. Most browsers and apps handle it, but a few chat apps cut long links, so use <b>Download a backup</b> if the other device does not show everything.");
		else notice("");
	}
	$("gc-link-all").onclick = function () { copyLink(ws.courses, ws.courses.indexOf(course()), "all " + ws.courses.length + (ws.courses.length === 1 ? " course" : " courses")); };
	$("gc-link-one").onclick = function () { copyLink([course()], 0, "this course"); };
	$("gc-backup").onclick = function () {
		var a = document.createElement("a"), d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
		var url = URL.createObjectURL(new Blob([JSON.stringify({ app: "mes-gradecalculator", v: 1, courses: ws.courses, cur: ws.cur }, null, 1)], { type: "application/json" }));
		a.href = url; a.download = "grade-calculator-backup-" + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + ".json";
		document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 500);
	};
	$("gc-restore").onclick = function () { $("gc-file").click(); };
	$("gc-file").onchange = function () {
		var f = this.files && this.files[0]; this.value = ""; if (!f) return;
		var rd = new FileReader();
		rd.onload = function () {
			try {
				var j = JSON.parse(rd.result); if (!j || !Array.isArray(j.courses) || !j.courses.length) throw 0;
				var list = j.courses.slice(0, 40).map(function (c) { c.id = uid(); return normaliseCourse(c); });
				addCourses(list, 0, "Restored");
			} catch (e) { toast("That does not look like a Grade Calculator backup"); }
		};
		rd.readAsText(f);
	};
	document.querySelector("#gc .gc-print").onclick = function () { window.print(); };

	// add courses that arrived by link / backup (skip exact duplicates); a still-blank starting course is replaced
	function sig(c) { return GC.encode([c], 0); }
	function addCourses(list, curIdx, verb) {
		var have = {}; ws.courses.forEach(function (c) { have[sig(c)] = c; });
		var fresh = list.filter(function (c) { return !have[sig(c)]; });
		if (ws.courses.length === 1 && isBlank(ws.courses[0]) && fresh.length) ws.courses = [];
		fresh.forEach(function (c) { ws.courses.push(c); });
		var target = fresh.length ? fresh[Math.min(curIdx, fresh.length - 1)] : have[sig(list[Math.min(curIdx, list.length - 1)])];
		if (target) ws.cur = target.id;
		save(); renderAll();
		toast(fresh.length ? verb + " " + fresh.length + (fresh.length === 1 ? " course" : " courses") : "Those courses were already here");
	}

	/* ---------- old /gradecalculator/s/<id> links and simple query links ---------- */
	function loadOld(id) {
		notice("Loading the calculation from your shared link…");
		var f = window.fetch ? window.fetch("/api/share?calc=gc&id=" + encodeURIComponent(id)).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); }) : Promise.reject(new Error("no fetch"));
		return f.then(function (d) {
			var c = GC.fromOldShare(d); if (!c) throw new Error("bad data");
			c.id = uid(); normaliseCourse(c); notice(""); addCourses([c], 0, "Opened");
			history.replaceState(null, "", "/gradecalculator");
		}).catch(function () {
			notice("That old shared link could not be loaded (it may have expired). Here is your calculator &mdash; enter your grades above.");
		});
	}

	/* ---------- render everything ---------- */
	function renderAll() { renderCourses(); fillSetup(); if (course().mode === "items") renderRows(); update(); save(); }

	/* ---------- init ---------- */
	ws = load();
	var q = new URLSearchParams(location.search), m = location.pathname.match(/^\/gradecalculator\/s\/([A-Za-z0-9]+)\/?$/);
	renderAll();
	if (q.get("s")) {
		var dec = GC.decode(q.get("s"));
		if (dec) { addCourses(dec.courses.map(function (c) { c.id = uid(); return c; }), dec.cur, "Opened"); history.replaceState(null, "", location.pathname); }
		else notice("That link could not be read. Ask for a fresh one, or type your grades above.");
	} else if (q.get("target") != null || q.get("current") != null || q.get("weight") != null) {
		var c0 = newCourse("Shared course"); c0.target = q.get("target") || "80"; c0.cur = q.get("current") || ""; c0.fw = q.get("weight") || "";
		addCourses([c0], 0, "Opened"); history.replaceState(null, "", location.pathname);
	} else if (m) loadOld(m[1]);
	window.addEventListener("storage", function (e) {
		if (e.key !== KEY || (document.activeElement && root.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
		try { var s = JSON.parse(e.newValue); if (s && Array.isArray(s.courses) && s.courses.length) { s.courses = s.courses.map(normaliseCourse); ws = s; if (!find(ws, ws.cur)) ws.cur = ws.courses[0].id; renderAll(); } } catch (x) {}
	});
	var wi = $("gc-wi"); if (!wi.value) wi.value = "75";
	update();
})();
