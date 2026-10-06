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
