/* MES Weighted Average Calculator -- pure maths + share encoding (no DOM). Browser global `WA`; node: require('./tool_apps_src/weighted-average-calculator/lib.js')
 * rows: [{ n (name), v (value / grade), w (weight) }] ; tests: node tool_apps_src/weighted-average-tests.js */
(function (root) {
	"use strict";
	function num(v) {
		if (v == null) return null;
		var t = String(v).trim().replace(/%/g, "").replace(/\s+/g, "");
		if (t === "") return null;
		if (/^-?\d+,\d{1,3}$/.test(t) && !/^-?\d{1,3},\d{3}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
		var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d, trim) {
		if (n == null || !isFinite(n)) return "";
		var s = (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
		if (Object.is(parseFloat(s), -0)) s = (0).toFixed(d);
		return trim ? s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "") : s;
	}
	function blankRow() { return { n: "", v: "", w: "" }; }
	// -> { used, skipped, sumW, sumVW, avg, simple, rows: [{i, v, w, share, contrib}], warn }
	function compute(rows) {
		var out = { used: 0, skipped: 0, sumW: 0, sumVW: 0, sumV: 0, avg: null, simple: null, rows: [], warn: "" };
		rows.forEach(function (x, i) {
			var v = num(x.v), w = num(x.w);
			if (v == null && w == null) return;
			if (v == null || w == null) { out.skipped++; return; }
			if (w < 0) { out.warn = "A weight is negative, so that row is not counted."; out.skipped++; return; }
			out.used++; out.sumW += w; out.sumVW += v * w; out.sumV += v; out.rows.push({ i: i, v: v, w: w });
		});
		if (out.used) {
			out.simple = out.sumV / out.used;
			if (out.sumW > 0) { out.avg = out.sumVW / out.sumW; out.rows.forEach(function (r) { r.share = r.w / out.sumW * 100; r.contrib = r.v * r.w / out.sumW; }); }
			else out.warn = out.warn || "All the weights are zero, so there is nothing to average.";
		}
		return out;
	}
	function b64e(str) { var b = typeof Buffer !== "undefined" ? Buffer.from(str, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(str))); return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
	function b64d(s) { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return typeof Buffer !== "undefined" ? Buffer.from(s, "base64").toString("utf8") : decodeURIComponent(escape(atob(s))); }
	function encode(rows, title) {
		var o = rows.map(function (x) { return [x.n || "", x.v || "", x.w || ""]; });
		while (o.length && !o[o.length - 1].join("")) o.pop();
		return "1" + b64e(JSON.stringify([title || "", o]));
	}
	function decode(s) {
		try {
			s = String(s || ""); if (s.charAt(0) !== "1") return null;
			var j = JSON.parse(b64d(s.slice(1))); if (!Array.isArray(j) || !Array.isArray(j[1])) return null;
			var rows = j[1].slice(0, 300).map(function (a) { return { n: String(a[0] || "").slice(0, 60), v: String(a[1] || "").slice(0, 14), w: String(a[2] || "").slice(0, 14) }; });
			while (rows.length < 5) rows.push(blankRow());
			return { title: String(j[0] || "").slice(0, 60), rows: rows };
		} catch (e) { return null; }
	}
	// "90,80,70" + "3,4,2" -> rows (for ?g=&w= links); pads / trims to the longer list
	function fromLists(g, w) {
		var a = String(g || "").split(/[,;|\s]+/).filter(Boolean), b = String(w || "").split(/[,;|\s]+/).filter(Boolean), n = Math.max(a.length, b.length), rows = [];
		for (var i = 0; i < Math.min(n, 300); i++) rows.push({ n: "", v: a[i] || "", w: b[i] || "" });
		while (rows.length < 5) rows.push(blankRow());
		return rows;
	}
	var WA = { num: num, fix: fix, blankRow: blankRow, compute: compute, encode: encode, decode: decode, fromLists: fromLists };
	if (typeof module !== "undefined" && module.exports) module.exports = WA; else root.WA = WA;
})(typeof window !== "undefined" ? window : globalThis);
