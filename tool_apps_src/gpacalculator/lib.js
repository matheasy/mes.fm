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
