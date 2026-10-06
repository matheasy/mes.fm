/* MES GPA Calculator -- pure maths + share encoding (no DOM). Browser global `GP`; node: require('./tool_apps_src/gpacalculator/lib.js'); tests: node tool_apps_src/gpa-tests.js
 * course = { n (name), g (grade: a letter like "A-" or a percentage like "92"), c (credits), l ("r" regular | "h" honors | "a" AP / IB) }
 * workspace = { scale: "4" | "433", weighted: bool, prior: { gpa, credits }, terms: [{ name, courses }], cur: term index, plan: { target, credits } }
 */
(function (root) {
	"use strict";
	var SCALES = {
		"4": { max: 4.0, name: "4.0",
			letters: [["A+", 4.0], ["A", 4.0], ["A-", 3.7], ["B+", 3.3], ["B", 3.0], ["B-", 2.7], ["C+", 2.3], ["C", 2.0], ["C-", 1.7], ["D+", 1.3], ["D", 1.0], ["D-", 0.7], ["F", 0]],
			pct: [[93, 4.0], [90, 3.7], [87, 3.3], [83, 3.0], [80, 2.7], [77, 2.3], [73, 2.0], [70, 1.7], [67, 1.3], [65, 1.0], [0, 0]] },
		"433": { max: 4.33, name: "4.33",
			letters: [["A+", 4.33], ["A", 4.0], ["A-", 3.67], ["B+", 3.33], ["B", 3.0], ["B-", 2.67], ["C+", 2.33], ["C", 2.0], ["C-", 1.67], ["D+", 1.33], ["D", 1.0], ["D-", 0.67], ["F", 0]],
			pct: [[90, 4.33], [85, 4.0], [80, 3.67], [77, 3.33], [73, 3.0], [70, 2.67], [67, 2.33], [63, 2.0], [60, 1.67], [55, 1.33], [50, 1.0], [0, 0]] }
	};
	var BONUS = { r: 0, h: 0.5, a: 1.0 };

	function num(v) {
		if (v == null) return null;
		var t = String(v).trim().replace(/%/g, "").replace(/\s+/g, "");
		if (t === "") return null;
		if (/^-?\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
		var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; var s = (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); return Object.is(parseFloat(s), -0) ? (0).toFixed(d) : s; }

	// grade text -> { pts, kind: "letter" | "pct", label } or null.  Percentages are rounded first (as the old calculator did).
	function parseGrade(text, scale) {
		var S = SCALES[scale] || SCALES["4"], t = String(text == null ? "" : text).trim();
		if (!t) return null;
		var m = /^([A-Fa-f])\s*([+\-−]?)$/.exec(t);
		if (m) {
			var L = m[1].toUpperCase() + (m[2] === "−" ? "-" : m[2]);
			if (L === "F+" || L === "F-") L = "F";
			for (var i = 0; i < S.letters.length; i++) if (S.letters[i][0] === L) return { pts: S.letters[i][1], kind: "letter", label: L };
			return null;
		}
		var p = num(t);
		if (p == null || p < 0 || p > 110) return null;
		p = Math.round(p);
		for (var j = 0; j < S.pct.length; j++) if (p >= S.pct[j][0]) return { pts: S.pct[j][1], kind: "pct", label: letterFor(S.pct[j][1], scale) };
		return { pts: 0, kind: "pct", label: "F" };
	}
	// the highest letter whose points are not above `pts` (on the 4.0 scale A+ and A are both 4.0: call it A)
	function letterFor(pts, scale) {
		var S = SCALES[scale] || SCALES["4"];
		if (pts == null) return "";
		for (var i = 0; i < S.letters.length; i++) {
			if (S.letters[i][0] === "A+" && S.letters[i][1] === S.letters[i + 1][1]) continue;
			if (pts + 1e-9 >= S.letters[i][1]) return S.letters[i][0];
		}
		return "F";
	}

	// one term: courses -> { gpa, credits, qp, used, skipped }; blank credits count as 1
	function term(courses, scale, weighted) {
		var o = { gpa: null, credits: 0, qp: 0, used: 0, skipped: 0 };
		(courses || []).forEach(function (c) {
			var gTxt = (c.g || "").trim(), cTxt = (c.c || "").trim();
			if (!gTxt && !cTxt) return;
			var g = parseGrade(gTxt, scale), cr = cTxt === "" ? 1 : num(cTxt);
			if (!g || cr == null || cr < 0) { o.skipped++; return; }
			var pts = g.pts + (weighted && g.pts > 0 ? (BONUS[c.l] || 0) : 0);
			o.credits += cr; o.qp += pts * cr; o.used++;
		});
		if (o.credits > 0) o.gpa = o.qp / o.credits;
		return o;
	}
	// everything: prior work + every term
	function overall(ws) {
		var prior = { gpa: num(ws.prior && ws.prior.gpa), credits: num(ws.prior && ws.prior.credits) }, terms = ws.terms.map(function (t) { return term(t.courses, ws.scale, ws.weighted); });
		var credits = 0, qp = 0, hasPrior = prior.gpa != null && prior.credits != null && prior.credits > 0;
		if (hasPrior) { credits += prior.credits; qp += prior.gpa * prior.credits; }
		terms.forEach(function (t) { credits += t.credits; qp += t.qp; });
		return { terms: terms, credits: credits, qp: qp, gpa: credits > 0 ? qp / credits : null, hasPrior: hasPrior, skipped: terms.reduce(function (a, t) { return a + t.skipped; }, 0) };
	}
	// GPA needed over `credits` future credits to reach `target`
	function planNeeded(all, scale, target, credits) {
		var T = num(target), N = num(credits), S = SCALES[scale] || SCALES["4"];
		if (T == null || N == null || N <= 0) return null;
		var need = (T * (all.credits + N) - all.qp) / N;
		return { need: need, status: need > S.max + 1e-9 ? "impossible" : need <= 1e-9 ? "secure" : "ok", max: S.max };
	}

	/* ---------- sharing ---------- */
	function b64e(str) { var b = typeof Buffer !== "undefined" ? Buffer.from(str, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(str))); return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
	function b64d(s) { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return typeof Buffer !== "undefined" ? Buffer.from(s, "base64").toString("utf8") : decodeURIComponent(escape(atob(s))); }
	function blankCourse() { return { n: "", g: "", c: "", l: "r" }; }
	function blankTerm(name) { var cs = []; for (var i = 0; i < 5; i++) cs.push(blankCourse()); return { name: name || "Term 1", courses: cs }; }
	function blankWs() { return { scale: "4", weighted: false, prior: { gpa: "", credits: "" }, terms: [blankTerm("Term 1")], cur: 0, plan: { target: "", credits: "" } }; }
	function trim(cs) { var o = cs.map(function (c) { return [c.n || "", c.g || "", c.c || "", c.l === "h" ? "h" : c.l === "a" ? "a" : ""]; }); while (o.length && !o[o.length - 1].slice(0, 3).join("")) o.pop(); return o; }
	function encode(ws, onlyCur) {
		var terms = onlyCur ? [ws.terms[ws.cur]] : ws.terms;
		return "1" + b64e(JSON.stringify([ws.scale, ws.weighted ? 1 : 0, [ws.prior.gpa || "", ws.prior.credits || ""], terms.map(function (t) { return [t.name || "", trim(t.courses)]; }), onlyCur ? 0 : ws.cur, [ws.plan.target || "", ws.plan.credits || ""]]));
	}
	function decode(s) {
		try {
			s = String(s || ""); if (s.charAt(0) !== "1") return null;
			var j = JSON.parse(b64d(s.slice(1))); if (!Array.isArray(j) || !Array.isArray(j[3])) return null;
			var ws = blankWs();
			ws.scale = j[0] === "433" ? "433" : "4"; ws.weighted = !!j[1];
			ws.prior = { gpa: String((j[2] || [])[0] || "").slice(0, 8), credits: String((j[2] || [])[1] || "").slice(0, 8) };
			ws.terms = j[3].slice(0, 30).map(function (t, i) {
				var cs = (Array.isArray(t[1]) ? t[1] : []).slice(0, 80).map(function (a) { return { n: String(a[0] || "").slice(0, 60), g: String(a[1] || "").slice(0, 10), c: String(a[2] || "").slice(0, 8), l: a[3] === "h" || a[3] === "a" ? a[3] : "r" }; });
				while (cs.length < 5) cs.push(blankCourse());
				return { name: String(t[0] || "Term " + (i + 1)).slice(0, 40), courses: cs };
			});
			if (!ws.terms.length) return null;
			ws.cur = +j[4] >= 0 && +j[4] < ws.terms.length ? +j[4] : 0;
			ws.plan = { target: String((j[5] || [])[0] || "").slice(0, 6), credits: String((j[5] || [])[1] || "").slice(0, 6) };
			return ws;
		} catch (e) { return null; }
	}
	// the 2013-2025 /gpacalculator/s/<id> links: { type: "percentage" | "letter", scale: "4" | "433", grades: [[percent | GPA points, credits], ...] }
	function fromOldShare(d) {
		if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return null; } }
		if (!d || !Array.isArray(d.grades) || !d.grades.length) return null;
		var ws = blankWs(); ws.scale = d.scale === "433" ? "433" : "4";
		var S = SCALES[ws.scale], courses = d.grades.filter(Array.isArray).map(function (a) {
			var g = a[0] == null ? "" : String(a[0]);
			if (d.type === "letter") {   // old selects stored the points of the chosen letter
				var pts = parseFloat(g), found = "";
				if (isFinite(pts) && pts > 0) S.letters.some(function (L) { if (Math.abs(L[1] - pts) < 0.005 && !(L[0] === "A+" && pts === 4.0)) { found = L[0]; return true; } return false; });
				else if (g !== "" && isFinite(pts)) found = "F";
				g = found;
			}
			return { n: "", g: g, c: a[1] == null ? "" : String(a[1]), l: "r" };
		});
		if (!courses.length) return null;
		while (courses.length < 5) courses.push(blankCourse());
		ws.terms[0].courses = courses; return ws;
	}

	var GP = { SCALES: SCALES, num: num, fix: fix, parseGrade: parseGrade, letterFor: letterFor, term: term, overall: overall, planNeeded: planNeeded, blankCourse: blankCourse, blankTerm: blankTerm, blankWs: blankWs, encode: encode, decode: decode, fromOldShare: fromOldShare };
	if (typeof module !== "undefined" && module.exports) module.exports = GP; else root.GP = GP;
})(typeof window !== "undefined" ? window : globalThis);

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
		w.terms.forEach(function (t) { t.name = String(t.name || "Term"); if (!Array.isArray(t.courses)) t.courses = []; t.courses = t.courses.map(function (c) { return { n: String(c.n || ""), g: String(c.g || ""), c: String(c.c || ""), l: c.l === "h" || c.l === "a" ? c.l : "r" }; }); while (t.courses.length < 5) t.courses.push(GP.blankCourse()); });
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
		return '<div class="gp-row" data-i="' + i + '"><span class="gp-n">' + (i + 1) + '</span>' +
			'<div class="gp-f gp-f-n"><label>Course</label><input class="tu-input" data-k="n" type="text" maxlength="60" autocomplete="off" placeholder="optional" value="' + esc(c.n) + '"></div>' +
			'<div class="gp-f gp-f-g"><label>Grade</label><input class="tu-input' + (bad ? " gp-bad" : "") + '" data-k="g" type="text" list="gp-letters" autocomplete="off" autocapitalize="characters" placeholder="A- or 92" value="' + esc(c.g) + '" aria-invalid="' + !!bad + '"></div>' +
			'<div class="gp-f gp-f-c"><label>Credits</label><input class="tu-input" data-k="c" type="text" inputmode="decimal" autocomplete="off" placeholder="1" value="' + esc(c.c) + '"></div>' +
			(ws.weighted ? '<div class="gp-f gp-f-l"><label>Level</label><select class="tu-select" data-k="l"><option value="r"' + (c.l === "r" ? " selected" : "") + '>Regular</option><option value="h"' + (c.l === "h" ? " selected" : "") + '>Honors</option><option value="a"' + (c.l === "a" ? " selected" : "") + '>AP / IB</option></select></div>' : "") +
			'<span class="gp-pts" data-pts>' + (g ? GP.fix(g.pts, 2) + " pts" : "") + '</span>' +
			'<button type="button" class="tu-btn tu-btn--ghost gp-del" title="Remove this course" aria-label="Remove course ' + (i + 1) + '">✕</button></div>';
	}
	function renderRows() { $("gp-rows").innerHTML = term().courses.map(rowHtml).join(""); }
	$("gp-rows").addEventListener("input", function (e) {
		var row = e.target.closest(".gp-row"); if (!row) return; var c = term().courses[+row.dataset.i], k = e.target.dataset.k; c[k] = e.target.value;
		if (k === "g") { var g = GP.parseGrade(c.g, ws.scale), bad = c.g.trim() && !g; e.target.classList.toggle("gp-bad", !!bad); e.target.setAttribute("aria-invalid", String(!!bad)); row.querySelector("[data-pts]").textContent = g ? GP.fix(g.pts, 2) + " pts" : ""; }
		save(); update();
	});
	$("gp-rows").addEventListener("change", function (e) { if (e.target.dataset.k === "l") { var row = e.target.closest(".gp-row"); term().courses[+row.dataset.i].l = e.target.value; save(); update(); } });
	$("gp-rows").addEventListener("click", function (e) {
		var b = e.target.closest(".gp-del"); if (!b) return; var i = +b.closest(".gp-row").dataset.i, cs = term().courses;
		if (cs.length > 1) cs.splice(i, 1); else cs[0] = GP.blankCourse();
		while (cs.length < 5) cs.push(GP.blankCourse()); save(); renderRows(); update();
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
