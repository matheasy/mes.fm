/* MES BMI Calculator -- pure maths + share encoding (no DOM). Browser global `BM`; node: require('./tool_apps_src/bmicalculator/lib.js'); tests: node tool_apps_src/bmi-tests.js
 * Everything is stored in kilograms and centimetres; pounds / feet / inches are conversions of those. */
(function (root) {
	"use strict";
	var LB = 0.45359237, IN = 2.54;
	function num(v) {
		if (v == null) return null;
		var t = String(v).trim().replace(/\s+/g, "");
		if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
		var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	// typed numbers on a decimal-comma page (es, de, vi ...): "68,5" = 68.5 and "1.234,5" = 1234.5, while a plain "68.5" still works
	function numLoc(v, comma) {
		if (v == null) return null;
		var t = String(v).trim().replace(/[\u0660-\u0669]/g, function (c) { return c.charCodeAt(0) - 0x660; }).replace(/[\u06f0-\u06f9]/g, function (c) { return c.charCodeAt(0) - 0x6f0; }).replace(/\u066b/g, ".").replace(/\u066c/g, "");   // Arabic-Indic digits, Arabic decimal / thousands marks
		if (!comma) return num(t);
		t = t.replace(/[\s\u00a0\u202f']+/g, "");
		if (t.indexOf(",") >= 0) t = t.replace(/\./g, "").replace(",", ".");
		return num(t);
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }

	/* ---------- conversions ---------- */
	function lbToKg(lb) { return lb * LB; } function kgToLb(kg) { return kg / LB; }
	function ftInToCm(ft, inch) { return ((ft || 0) * 12 + (inch || 0)) * IN; }
	function cmToFtIn(cm) { var t = cm / IN, ft = Math.floor(t / 12 + 1e-9), inch = t - ft * 12; if (inch > 11.995) { ft++; inch = 0; } return { ft: ft, inch: inch }; }

	/* ---------- BMI ---------- */
	function bmi(kg, cm) { if (!(kg > 0) || !(cm > 0)) return null; var m = cm / 100; return kg / (m * m); }
	function weightAt(b, cm) { var m = cm / 100; return b * m * m; }   // kg that gives BMI b at that height

	// WHO adult cut-offs, or the WHO Asia-Pacific cut-offs ("asia": 23 and 27.5)
	var SCALES = {
		who: { name: "WHO standard", cuts: [[16, "Severe thinness", "under"], [17, "Moderate thinness", "under"], [18.5, "Mild thinness", "under"], [25, "Normal weight", "normal"], [30, "Overweight", "over"], [35, "Obese (class I)", "obese"], [40, "Obese (class II)", "obese"], [Infinity, "Obese (class III)", "obese"]], lo: 18.5, hi: 25 },
		asia: { name: "Asian (WHO Asia-Pacific)", cuts: [[16, "Severe thinness", "under"], [17, "Moderate thinness", "under"], [18.5, "Mild thinness", "under"], [23, "Normal weight", "normal"], [27.5, "Overweight", "over"], [Infinity, "Obese", "obese"]], lo: 18.5, hi: 23 },
		// Consensus statement for Asian Indians (Misra et al., JAPI 2009), used by Indian doctors: underweight < 18, normal 18-22.9, overweight 23-24.9, obese from 25
		india: { name: "India (2009 consensus guideline)", cuts: [[18, "Underweight", "under"], [23, "Normal weight", "normal"], [25, "Overweight", "over"], [Infinity, "Obese", "obese"]], lo: 18, hi: 23 }
	};
	// the BMI is rounded to 1 decimal first (as the old calculator did): 24.95 -> 25.0 counts as overweight
	function category(b, scale) {
		var S = SCALES[scale] || SCALES.who, r = Math.round(b * 10) / 10;
		for (var i = 0; i < S.cuts.length; i++) if (r < S.cuts[i][0] - 1e-9) return { name: S.cuts[i][1], group: S.cuts[i][2], index: i };
		var L = S.cuts[S.cuts.length - 1]; return { name: L[1], group: L[2], index: S.cuts.length - 1 };
	}
	// healthy weight range for a height: BMI 18.5 up to the highest BMI still shown as normal (24.9 WHO / 22.9 Asian)
	function healthyRange(cm, scale) {
		var S = SCALES[scale] || SCALES.who, top = Math.round((S.hi - 0.1) * 10) / 10;
		return { lo: weightAt(S.lo, cm), hi: weightAt(top, cm), loBmi: S.lo, hiBmi: top };
	}
	// how much to gain / lose (kg, positive numbers) to reach the healthy range; both ends given
	function toNormal(kg, cm, scale) {
		var R = healthyRange(cm, scale);
		if (kg < R.lo) return { dir: "gain", min: R.lo - kg, max: R.hi - kg };
		if (kg > R.hi) return { dir: "lose", min: kg - R.hi, max: kg - R.lo };
		return { dir: "none", min: 0, max: 0 };
	}
	function prime(b, scale) { var S = SCALES[scale] || SCALES.who; return b / (S.hi); }   // BMI Prime = BMI / upper normal limit
	function ponderal(kg, cm) { var m = cm / 100; return kg / (m * m * m); }

	/* ---------- history entries ---------- */
	// entry = { d: "YYYY-MM-DD", kg, cm, n (note) }
	function sortEntries(list) { return list.slice().sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; }); }
	function cleanEntry(e) {
		var kg = num(e && e.kg), cm = num(e && e.cm), d = String((e && e.d) || "");
		if (!(kg > 0 && kg < 700) || !(cm > 30 && cm < 280) || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
		return { d: d, kg: Math.round(kg * 100) / 100, cm: Math.round(cm * 10) / 10, n: String((e && e.n) || "").slice(0, 60) };
	}

	/* ---------- sharing ---------- */
	function b64e(str) { var b = typeof Buffer !== "undefined" ? Buffer.from(str, "utf8").toString("base64") : btoa(unescape(encodeURIComponent(str))); return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
	function b64d(s) { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return typeof Buffer !== "undefined" ? Buffer.from(s, "base64").toString("utf8") : decodeURIComponent(escape(atob(s))); }
	function encode(st) { return "1" + b64e(JSON.stringify([st.kg || "", st.cm || "", st.scale === "asia" ? 1 : st.scale === "india" ? 2 : 0, sortEntries(st.history || []).map(function (e) { return [e.d, e.kg, e.cm, e.n || ""]; })])); }
	function decode(s) {
		try {
			s = String(s || ""); if (s.charAt(0) !== "1") return null;
			var j = JSON.parse(b64d(s.slice(1))); if (!Array.isArray(j)) return null;
			var h = (Array.isArray(j[3]) ? j[3] : []).slice(0, 400).map(function (a) { return cleanEntry({ d: a[0], kg: a[1], cm: a[2], n: a[3] }); }).filter(Boolean);
			return { kg: String(j[0] || "").slice(0, 8), cm: String(j[1] || "").slice(0, 8), scale: j[2] === 2 ? "india" : j[2] ? "asia" : "who", history: h };
		} catch (e) { return null; }
	}
	// the 2013-2025 /bmicalculator/s/<id> links: { weight (kg), height (cm) }
	function fromOldShare(d) {
		if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return null; } }
		if (!d || !(d.weight > 0) || !(d.height > 0)) return null;
		return { kg: String(Math.round(d.weight * 100) / 100), cm: String(Math.round(d.height * 10) / 10) };
	}

	/* ---------- weight-for-height chart (the classic "BMI chart"): returns an SVG string ----------
	 * o = { kg, cm, scale, imperial, w, h, labels: { weight, height, under, normal, over, obese }, fmt(n, d) }
	 * x = height, y = weight; the four coloured regions are bounded by the curves weight = BMI x height^2 at the scale's group edges. */
	function groupEdges(scale) {
		var S = SCALES[scale] || SCALES.who, out = [], g = S.cuts[0][2];
		S.cuts.forEach(function (c, i) { if (i && c[2] !== S.cuts[i - 1][2]) out.push([S.cuts[i - 1][0], S.cuts[i - 1][2]]); });
		out.push([Infinity, S.cuts[S.cuts.length - 1][2]]);
		return out;      // [[upper BMI, group], ...] e.g. WHO: [[18.5,"under"],[25,"normal"],[30,"over"],[Inf,"obese"]]
	}
	function chartRange(kg, cm) {
		var r = { h0: 145, h1: 200, w0: 35, w1: 130 };
		if (cm > 0) { r.h0 = Math.min(r.h0, Math.floor((cm - 8) / 5) * 5); r.h1 = Math.max(r.h1, Math.ceil((cm + 8) / 5) * 5); }
		if (kg > 0) { r.w0 = Math.min(r.w0, Math.floor((kg - 10) / 5) * 5); r.w1 = Math.max(r.w1, Math.ceil((kg + 12) / 5) * 5); }
		r.h0 = Math.max(50, r.h0); r.w0 = Math.max(2, r.w0); r.h1 = Math.min(260, r.h1); r.w1 = Math.min(400, r.w1);
		return r;
	}
	function chartSvg(o) {
		o = o || {}; var L = o.labels || {}, fmt = o.fmt || function (n, d) { return n.toFixed(d || 0); };
		var W = o.w || 640, H = o.h || 400, ml = 56, mr = 14, mt = 12, mb = 46, pw = W - ml - mr, ph = H - mt - mb;
		var kg = +o.kg || 0, cm = +o.cm || 0, R = o.range || chartRange(kg, cm), imp = !!o.imperial;
		var X = function (h) { return ml + (h - R.h0) / (R.h1 - R.h0) * pw; }, Y = function (w) { return mt + ph - (w - R.w0) / (R.w1 - R.w0) * ph; };
		var r1 = function (v) { return Math.round(v * 10) / 10; };
		var s = '<svg class="bm-chart" viewBox="0 0 ' + W + " " + H + '" xmlns="http://www.w3.org/2000/svg" role="img"' + (o.aria ? ' aria-label="' + o.aria + '"' : "") + '><defs><clipPath id="bmc-clip"><rect x="' + ml + '" y="' + mt + '" width="' + pw + '" height="' + ph + '"/></clipPath></defs><g clip-path="url(#bmc-clip)">';
		var edges = groupEdges(o.scale), lo = 0, N = 40;
		edges.forEach(function (e) {
			var hi = e[0], pts = [], i, h;
			for (i = 0; i <= N; i++) { h = R.h0 + (R.h1 - R.h0) * i / N; pts.push(r1(X(h)) + "," + r1(Y(lo ? lo * h * h / 1e4 : R.w0 - 50))); }
			for (i = N; i >= 0; i--) { h = R.h0 + (R.h1 - R.h0) * i / N; pts.push(r1(X(h)) + "," + r1(Y(hi === Infinity ? R.w1 + 50 : hi * h * h / 1e4))); }
			s += '<polygon class="bm-reg bm-reg--' + e[1] + '" points="' + pts.join(" ") + '"/>';
			lo = hi;
		});
		// BMI curves every 5 (thin) for reading off values
		for (var b = 15; b <= 60; b += 5) {
			var hA = R.h0, hB = R.h1, p = [], j;
			for (j = 0; j <= N; j++) { var hh = hA + (hB - hA) * j / N; p.push(r1(X(hh)) + "," + r1(Y(b * hh * hh / 1e4))); }
			s += '<polyline class="bm-iso" points="' + p.join(" ") + '"/>';
			var wEnd = b * R.h1 * R.h1 / 1e4;
			if (wEnd < R.w1 - 2 && wEnd > R.w0 + 2) s += '<text class="bm-isot" x="' + (ml + pw - 4) + '" y="' + r1(Y(wEnd) - 3) + '" text-anchor="end">' + b + "</text>";
			else { var hTop = Math.sqrt(R.w1 * 1e4 / b); if (hTop > R.h0 + 3 && hTop < R.h1) s += '<text class="bm-isot" x="' + r1(X(hTop) + 3) + '" y="' + (mt + 11) + '">' + b + "</text>"; }
		}
		s += "</g>";
		// region names at the left edge, half way between their curves
		var lo2 = 0;
		edges.forEach(function (e) {
			var hx = R.h0 + (R.h1 - R.h0) * 0.12, a = lo2 ? lo2 * hx * hx / 1e4 : R.w0, c = e[0] === Infinity ? R.w1 : e[0] * hx * hx / 1e4;
			a = Math.max(a, R.w0); c = Math.min(c, R.w1);
			if (L[e[1]] && c - a > (R.w1 - R.w0) * 0.07) s += '<text class="bm-regt" x="' + r1(X(hx)) + '" y="' + r1(Y((a + c) / 2) + 4) + '">' + L[e[1]] + "</text>";
			lo2 = e[0];
		});
		// axes
		s += '<rect class="bm-frame" x="' + ml + '" y="' + mt + '" width="' + pw + '" height="' + ph + '" fill="none"/>';
		var t, v;
		if (imp) {
			var i0 = Math.ceil(R.h0 / 2.54 / 4) * 4;
			for (t = i0; t * 2.54 <= R.h1; t += 4) s += '<text class="bm-ct" x="' + r1(X(t * 2.54)) + '" y="' + (mt + ph + 16) + '" text-anchor="middle">' + Math.floor(t / 12) + "\u2032" + (t % 12) + "\u2033</text>";
			var l0 = Math.ceil(R.w0 / 0.45359237 / 20) * 20, stepL = R.w1 - R.w0 > 200 ? 40 : 20;
			for (t = l0; t * 0.45359237 <= R.w1; t += stepL) { v = t * 0.45359237; s += '<line class="bm-gl" x1="' + ml + '" x2="' + (ml + pw) + '" y1="' + r1(Y(v)) + '" y2="' + r1(Y(v)) + '"/><text class="bm-ct" x="' + (ml - 5) + '" y="' + r1(Y(v) + 4) + '" text-anchor="end">' + t + "</text>"; }
		} else {
			for (t = Math.ceil(R.h0 / 10) * 10; t <= R.h1; t += 10) s += '<text class="bm-ct" x="' + r1(X(t)) + '" y="' + (mt + ph + 16) + '" text-anchor="middle">' + t + "</text>";
			var stepK = R.w1 - R.w0 > 150 ? 20 : 10;
			for (t = Math.ceil(R.w0 / stepK) * stepK; t <= R.w1; t += stepK) s += '<line class="bm-gl" x1="' + ml + '" x2="' + (ml + pw) + '" y1="' + r1(Y(t)) + '" y2="' + r1(Y(t)) + '"/><text class="bm-ct" x="' + (ml - 5) + '" y="' + r1(Y(t) + 4) + '" text-anchor="end">' + t + "</text>";
		}
		s += '<text class="bm-ct bm-axt" x="' + (ml + pw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + (L.height || "Height") + (imp ? " (ft, in)" : " (cm)") + "</text>";
		s += '<text class="bm-ct bm-axt" transform="translate(13 ' + (mt + ph / 2) + ') rotate(-90)" text-anchor="middle">' + (L.weight || "Weight") + (imp ? " (lb)" : " (kg)") + "</text>";
		// you
		if (kg > 0 && cm > 0) {
			var px = r1(X(cm)), py = r1(Y(kg)), bv = bmi(kg, cm);
			s += '<line class="bm-you-l" x1="' + px + '" x2="' + px + '" y1="' + py + '" y2="' + (mt + ph) + '"/><line class="bm-you-l" x1="' + ml + '" x2="' + px + '" y1="' + py + '" y2="' + py + '"/>';
			s += '<circle class="bm-you" cx="' + px + '" cy="' + py + '" r="7"/>';
			var right = px < ml + pw - 120;
			s += '<text class="bm-yout" x="' + (right ? px + 11 : px - 11) + '" y="' + (py - 9) + '" text-anchor="' + (right ? "start" : "end") + '">' + (L.you ? L.you + " " : "") + fmt(bv, 1) + "</text>";
		}
		return s + "</svg>";
	}
	function chartPoint(o, sx, sy) {      // inverse of chartSvg's mapping (viewBox units) -> { cm, kg } or null outside the plot
		var W = o.w || 640, H = o.h || 400, ml = 56, mr = 14, mt = 12, mb = 46, pw = W - ml - mr, ph = H - mt - mb, R = o.range || chartRange(+o.kg || 0, +o.cm || 0);
		if (sx < ml || sx > ml + pw || sy < mt || sy > mt + ph) return null;
		return { cm: R.h0 + (sx - ml) / pw * (R.h1 - R.h0), kg: R.w0 + (mt + ph - sy) / ph * (R.w1 - R.w0) };
	}

	var BM = { chartSvg: chartSvg, chartPoint: chartPoint, chartRange: chartRange, groupEdges: groupEdges, num: num, numLoc: numLoc, fix: fix, trim: trim, lbToKg: lbToKg, kgToLb: kgToLb, ftInToCm: ftInToCm, cmToFtIn: cmToFtIn, bmi: bmi, weightAt: weightAt, SCALES: SCALES, category: category, healthyRange: healthyRange, toNormal: toNormal,
		prime: prime, ponderal: ponderal, sortEntries: sortEntries, cleanEntry: cleanEntry, encode: encode, decode: decode, fromOldShare: fromOldShare };
	if (typeof module !== "undefined" && module.exports) module.exports = BM; else root.BM = BM;
})(typeof window !== "undefined" ? window : globalThis);
