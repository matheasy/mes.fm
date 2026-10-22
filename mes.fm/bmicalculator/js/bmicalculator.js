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
		var kg = +o.kg || 0, cm = +o.cm || 0, R = chartRange(kg, cm), imp = !!o.imperial;
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
		var W = o.w || 640, H = o.h || 400, ml = 56, mr = 14, mt = 12, mb = 46, pw = W - ml - mr, ph = H - mt - mb, R = chartRange(+o.kg || 0, +o.cm || 0);
		if (sx < ml || sx > ml + pw || sy < mt || sy > mt + ph) return null;
		return { cm: R.h0 + (sx - ml) / pw * (R.h1 - R.h0), kg: R.w0 + (mt + ph - sy) / ph * (R.w1 - R.w0) };
	}

	var BM = { chartSvg: chartSvg, chartPoint: chartPoint, chartRange: chartRange, groupEdges: groupEdges, num: num, numLoc: numLoc, fix: fix, trim: trim, lbToKg: lbToKg, kgToLb: kgToLb, ftInToCm: ftInToCm, cmToFtIn: cmToFtIn, bmi: bmi, weightAt: weightAt, SCALES: SCALES, category: category, healthyRange: healthyRange, toNormal: toNormal,
		prime: prime, ponderal: ponderal, sortEntries: sortEntries, cleanEntry: cleanEntry, encode: encode, decode: decode, fromOldShare: fromOldShare };
	if (typeof module !== "undefined" && module.exports) module.exports = BM; else root.BM = BM;
})(typeof window !== "undefined" ? window : globalThis);

/* MES BMI Calculator -- every UI string, one entry per language (English = the source). Browser global `BM_I18N`; node: require('./tool_apps_src/bmicalculator/i18n.js').
 * build_tool_apps.py reads this table (through node) to fill the {{t:key}} placeholders of content.html and the page meta (title, description, og:locale, hreflang),
 * and app.js picks the page's language from <div id="bm" data-lang="..">. Placeholders inside strings: {n} {u} {s} {lo} {hi} {cat} {catl} (= lower-case first letter) {min} {max} {d} {b} {w}.
 * Numbers written inside strings (1.00, 34.9 ...) use the language's own decimal mark. Strings used in HTML attributes must not contain a double quote.
 * Adding a language: copy an entry, translate every key (node tool_apps_src/bmi-tests.js checks that none is missing), add an APPS entry in build_tool_apps.py (BMI_LANGS) and seo/<code>.html. */
(function (root) {
	"use strict";
	var CATS_EN = ["Severe thinness", "Moderate thinness", "Mild thinness", "Normal weight", "Overweight", "Obese (class I)", "Obese (class II)", "Obese (class III)", "Obese", "Underweight"];
	function cats(list) { var o = {}; CATS_EN.forEach(function (k, i) { o[k] = list[i]; }); return o; }
	var I18N = {
		en: {
			code: "en", name: "English", path: "/bmicalculator", locale: "en-US", dec: ".", langLabel: "Language", defScale: "who", defUnits: "b", dir: "ltr",
			meta: { title: "BMI Calculator", tag: "Body mass index, healthy weight range and progress.", h1: "BMI Calculator", docTitle: "BMI Calculator | Math Easy Solutions", ogLocale: "en_US",
				desc: "Free BMI calculator: enter your weight and height in kg/cm or lb/ft/in to get your body mass index, your category, your healthy weight range and how much to gain or lose. WHO or Asian cut-offs, a gauge, and saved measurements with a BMI-over-time chart." },
			mixUnits: "<b>Mix units freely:</b> type weight in kg or lb and height in cm or ft + in, in any combination &mdash; the other fields fill in as you type.",
			weight: "Weight", height: "Height", phKg: "e.g. 65.8", phCm: "e.g. 182.9", phLb: "e.g. 145.1", phFt: "e.g. 6", phIn: "e.g. 0",
			hideOptions: "Hide options", options: "Options",
			showResultsIn: "Show results in", both: "Both", metric: "Metric", us: "US",
			bmiScale: "BMI scale", scaleWho: "WHO standard (overweight from 25)", scaleAsia: "Asian (overweight from 23)", scaleIndia: "India (2009 guideline: overweight from 23, obese from 25)", scaleHint: "",
			stepNote: "Every field stays in step with its twin. Adults 20 and over only; see the notes below.",
			emptyPrompt: "Enter your weight and height to see your BMI &mdash; or try an example: ",
			copyLink: "Copy link to this result", saveMeasurement: "Save this measurement", print: "Print", whereScale: "Where you are on the scale",
			myMeasurements: "My measurements", date: "Date", noteOpt: "Note (optional)", notePh: "e.g. after holiday", save: "Save", cancel: "Cancel",
			chartAria: "Chart of your saved BMI over time", copyCsv: "Copy as a spreadsheet table", copyLinkAll: "Copy link with my history",
			storeBlocked: "Your browser is blocking storage, so your measurements will be lost when you close this tab. Copy a link to keep them.",
			saved: { one: "{n} measurement saved in this browser.", other: "{n} measurements saved in this browser." },
			copyFailed: "Copy failed", copiedBtn: "Copied ✓",
			sumResults: "Results in {u} · {s}", unitsUS: "US units", unitsMetric: "metric", unitsBoth: "both units", scaleShortWho: "WHO scale", scaleShortIndia: "India scale", scaleShortAsia: "Asian scale",
			examples: [["6 ft, 145 lb", "65.77", "182.88"], ["170 cm, 85 kg", "85", "170"], ["5 ft 4 in, 120 lb", "54.43", "162.56"]],
			yourBmi: "Your BMI", healthyWeight: "Healthy weight for your height", bmiRange: "BMI {lo} to {hi}", bmiPrime: "BMI Prime", primeSub: "your BMI &divide; {hi} (1.00 or less is in range)",
			ponderal: "Ponderal Index", ponderalSub: "kg per m&sup3; (an alternative that suits very tall or short people)",
			verdictNormal: "You have a <b>normal body weight</b>. Great job! Your healthy range at this height is {lo} to {hi}.",
			verdictGain: "You are <b>{catl}</b>. To reach a normal body weight you would need to gain between <b>{min}</b> and <b>{max}</b>.",
			verdictLose: "You are <b>{catl}</b>. To reach a normal body weight you would need to lose between <b>{min}</b> and <b>{max}</b>.",
			verdictSmall: "BMI is a screening guide, not a diagnosis. It does not account for muscle, build, age or ethnicity.",
			enterFirst: "Enter your weight and height first", pickDate: "Pick a date", savedOn: "Saved {d}",
			thDate: "Date", thWeight: "Weight", thBmi: "BMI", thCategory: "Category", thNote: "Note", deleteAria: "Delete the entry of {d}",
			chartMore: "Save another measurement to see your BMI over time.", entryDeleted: "Entry deleted.", undo: "Undo",
			csvHeader: "Date\tWeight (kg)\tHeight (cm)\tBMI\tNote", csvCopied: "Copied: paste it into a spreadsheet",
			linkCopied: "Link copied", linkCopiedAll: "Link copied: it holds your whole history",
			loadingOld: "Loading the calculation from your shared link…", oldFailed: "That old shared link could not be loaded (it may have expired). Enter your weight and height above.",
			sharedLoaded: "Shared result loaded", openedShared: "Opened a shared result. It is saved in this browser now.", linkUnreadable: "That link could not be read.",
			refCategory: "Category", refWho: "WHO standard", refIndia: "India: 2009 consensus guideline for Asian Indians", refAsian: "Asian", refAndOver: "{n} and over",
			refClasses: "WHO obesity classes: class I 30 – 34.9, class II 35 – 39.9, class III 40 and over.",
			dotTitle: "{d}: BMI {b}, {w}",
			cats: cats(CATS_EN)
		},
		es: {
			code: "es", name: "Español", path: "/calculadora-imc", locale: "es-ES", dec: ",", langLabel: "Idioma", defScale: "who", defUnits: "m", dir: "ltr",
			meta: { title: "Calculadora IMC", tag: "Índice de masa corporal, peso saludable y tu evolución.", h1: "Calculadora de IMC (índice de masa corporal)", docTitle: "Calculadora IMC: calcula tu índice de masa corporal | MES", ogLocale: "es_ES",
				desc: "Calculadora de IMC gratis: escribe tu peso en kg y tu altura en cm y obtén tu índice de masa corporal, tu categoría según la OMS, tu peso saludable y cuántos kilos te sobran o te faltan." },
			mixUnits: "<b>Mezcla unidades libremente:</b> escribe tu peso en kilos o libras y tu altura en centímetros o en pies y pulgadas; los demás campos se rellenan solos mientras escribes.",
			weight: "Peso", height: "Altura", phKg: "p. ej. 68,5", phCm: "p. ej. 170", phLb: "p. ej. 151", phFt: "p. ej. 5", phIn: "p. ej. 7",
			hideOptions: "Ocultar opciones", options: "Opciones",
			showResultsIn: "Mostrar resultados en", both: "Ambos", metric: "Métrico", us: "EE. UU.",
			bmiScale: "Escala de IMC", scaleWho: "OMS estándar (sobrepeso desde 25)", scaleAsia: "Asiática (sobrepeso desde 23)", scaleIndia: "", scaleHint: "",
			stepNote: "Cada campo se actualiza junto con su equivalente. Solo para adultos de 20 años o más; lee las notas de abajo.",
			emptyPrompt: "Escribe tu peso y tu altura para ver tu IMC, o prueba un ejemplo: ",
			copyLink: "Copiar enlace a este resultado", saveMeasurement: "Guardar esta medición", print: "Imprimir", whereScale: "Dónde estás en la escala",
			myMeasurements: "Mis mediciones", date: "Fecha", noteOpt: "Nota (opcional)", notePh: "p. ej. después de vacaciones", save: "Guardar", cancel: "Cancelar",
			chartAria: "Gráfico de tu IMC guardado a lo largo del tiempo", copyCsv: "Copiar como tabla de hoja de cálculo", copyLinkAll: "Copiar enlace con mi historial",
			storeBlocked: "Tu navegador bloquea el almacenamiento, así que tus mediciones se perderán al cerrar esta pestaña. Copia un enlace para conservarlas.",
			saved: { one: "{n} medición guardada en este navegador.", other: "{n} mediciones guardadas en este navegador." },
			copyFailed: "No se pudo copiar", copiedBtn: "Copiado ✓",
			sumResults: "Resultados en {u} · {s}", unitsUS: "unidades de EE. UU.", unitsMetric: "sistema métrico", unitsBoth: "ambos sistemas", scaleShortWho: "escala de la OMS", scaleShortIndia: "", scaleShortAsia: "escala asiática",
			examples: [["170 cm, 65 kg", "65", "170"], ["160 cm, 72 kg", "72", "160"], ["182 cm, 95 kg", "95", "182"]],
			yourBmi: "Tu IMC", healthyWeight: "Peso saludable para tu altura", bmiRange: "IMC de {lo} a {hi}", bmiPrime: "IMC Prime", primeSub: "tu IMC &divide; {hi} (1,00 o menos está en el rango normal)",
			ponderal: "Índice ponderal", ponderalSub: "kg por m&sup3; (una alternativa para personas muy altas o muy bajas)",
			verdictNormal: "Tienes un <b>peso normal</b>. ¡Muy bien! Tu rango saludable para esta altura va de {lo} a {hi}.",
			verdictGain: "Tu resultado: <b>{catl}</b>. Para llegar a un peso normal tendrías que ganar entre <b>{min}</b> y <b>{max}</b>.",
			verdictLose: "Tu resultado: <b>{catl}</b>. Para llegar a un peso normal tendrías que perder entre <b>{min}</b> y <b>{max}</b>.",
			verdictSmall: "El IMC es una herramienta de cribado, no un diagnóstico. No tiene en cuenta la masa muscular, la complexión, la edad ni el origen étnico.",
			enterFirst: "Primero escribe tu peso y tu altura", pickDate: "Elige una fecha", savedOn: "Guardado: {d}",
			thDate: "Fecha", thWeight: "Peso", thBmi: "IMC", thCategory: "Categoría", thNote: "Nota", deleteAria: "Borrar la medición del {d}",
			chartMore: "Guarda otra medición para ver la evolución de tu IMC.", entryDeleted: "Medición borrada.", undo: "Deshacer",
			csvHeader: "Fecha\tPeso (kg)\tAltura (cm)\tIMC\tNota", csvCopied: "Copiado: pégalo en una hoja de cálculo",
			linkCopied: "Enlace copiado", linkCopiedAll: "Enlace copiado: incluye todo tu historial",
			loadingOld: "Cargando el cálculo de tu enlace…", oldFailed: "No se pudo cargar ese enlace antiguo (puede haber caducado). Escribe tu peso y tu altura arriba.",
			sharedLoaded: "Resultado compartido cargado", openedShared: "Has abierto un resultado compartido. Ya está guardado en este navegador.", linkUnreadable: "No se pudo leer ese enlace.",
			refCategory: "Categoría", refWho: "OMS estándar", refIndia: "", refAsian: "Asiática", refAndOver: "{n} o más",
			refClasses: "Clases de obesidad de la OMS: clase I 30 – 34,9, clase II 35 – 39,9, clase III 40 o más.",
			dotTitle: "{d}: IMC {b}, {w}",
			cats: cats(["Delgadez severa", "Delgadez moderada", "Delgadez leve", "Peso normal", "Sobrepeso", "Obesidad (clase I)", "Obesidad (clase II)", "Obesidad (clase III)", "Obesidad", "Bajo peso"])
		},
		"pt-BR": {
			code: "pt-BR", name: "Português (Brasil)", path: "/calculadora-imc-pt", locale: "pt-BR", dec: ",", langLabel: "Idioma", defScale: "who", defUnits: "m", dir: "ltr",
			meta: { title: "Calculadora de IMC", tag: "Índice de massa corporal, peso ideal e sua evolução.", h1: "Calculadora de IMC (índice de massa corporal)", docTitle: "Calculadora de IMC: calcule seu índice de massa corporal | MES", ogLocale: "pt_BR",
				desc: "Calculadora de IMC grátis: informe seu peso em kg e sua altura em cm e veja seu índice de massa corporal, sua classificação pela OMS, sua faixa de peso ideal e quantos quilos ganhar ou perder." },
			mixUnits: "<b>Misture as unidades à vontade:</b> digite o peso em quilos ou libras e a altura em centímetros ou em pés e polegadas; os outros campos são preenchidos enquanto você digita.",
			weight: "Peso", height: "Altura", phKg: "ex.: 68,5", phCm: "ex.: 170", phLb: "ex.: 151", phFt: "ex.: 5", phIn: "ex.: 7",
			hideOptions: "Ocultar opções", options: "Opções",
			showResultsIn: "Mostrar resultados em", both: "Ambos", metric: "Métrico", us: "EUA",
			bmiScale: "Escala do IMC", scaleWho: "Padrão da OMS (sobrepeso a partir de 25)", scaleAsia: "Asiática (sobrepeso a partir de 23)", scaleIndia: "", scaleHint: "",
			stepNote: "Cada campo acompanha o seu equivalente. Somente para adultos a partir de 20 anos; veja as observações abaixo.",
			emptyPrompt: "Informe seu peso e sua altura para ver seu IMC, ou experimente um exemplo: ",
			copyLink: "Copiar link deste resultado", saveMeasurement: "Salvar esta medição", print: "Imprimir", whereScale: "Onde você está na escala",
			myMeasurements: "Minhas medições", date: "Data", noteOpt: "Observação (opcional)", notePh: "ex.: depois das férias", save: "Salvar", cancel: "Cancelar",
			chartAria: "Gráfico do seu IMC salvo ao longo do tempo", copyCsv: "Copiar como tabela de planilha", copyLinkAll: "Copiar link com meu histórico",
			storeBlocked: "Seu navegador está bloqueando o armazenamento, então suas medições serão perdidas ao fechar esta aba. Copie um link para guardá-las.",
			saved: { one: "{n} medição salva neste navegador.", other: "{n} medições salvas neste navegador." },
			copyFailed: "Não foi possível copiar", copiedBtn: "Copiado ✓",
			sumResults: "Resultados em {u} · {s}", unitsUS: "unidades dos EUA", unitsMetric: "sistema métrico", unitsBoth: "os dois sistemas", scaleShortWho: "escala da OMS", scaleShortIndia: "", scaleShortAsia: "escala asiática",
			examples: [["170 cm, 65 kg", "65", "170"], ["160 cm, 72 kg", "72", "160"], ["180 cm, 95 kg", "95", "180"]],
			yourBmi: "Seu IMC", healthyWeight: "Peso saudável para sua altura", bmiRange: "IMC de {lo} a {hi}", bmiPrime: "IMC Prime", primeSub: "seu IMC &divide; {hi} (1,00 ou menos está na faixa normal)",
			ponderal: "Índice ponderal", ponderalSub: "kg por m&sup3; (uma alternativa para pessoas muito altas ou muito baixas)",
			verdictNormal: "Você está com o <b>peso normal</b>. Parabéns! Sua faixa saudável para esta altura vai de {lo} a {hi}.",
			verdictGain: "Sua classificação: <b>{catl}</b>. Para chegar ao peso normal, você precisaria ganhar entre <b>{min}</b> e <b>{max}</b>.",
			verdictLose: "Sua classificação: <b>{catl}</b>. Para chegar ao peso normal, você precisaria perder entre <b>{min}</b> e <b>{max}</b>.",
			verdictSmall: "O IMC é uma ferramenta de triagem, não um diagnóstico. Ele não considera massa muscular, estrutura corporal, idade nem etnia.",
			enterFirst: "Informe primeiro seu peso e sua altura", pickDate: "Escolha uma data", savedOn: "Salvo: {d}",
			thDate: "Data", thWeight: "Peso", thBmi: "IMC", thCategory: "Classificação", thNote: "Observação", deleteAria: "Excluir a medição de {d}",
			chartMore: "Salve outra medição para ver a evolução do seu IMC.", entryDeleted: "Medição excluída.", undo: "Desfazer",
			csvHeader: "Data\tPeso (kg)\tAltura (cm)\tIMC\tObservação", csvCopied: "Copiado: cole em uma planilha",
			linkCopied: "Link copiado", linkCopiedAll: "Link copiado: ele contém todo o seu histórico",
			loadingOld: "Carregando o cálculo do link compartilhado…", oldFailed: "Não foi possível carregar esse link antigo (talvez tenha expirado). Informe seu peso e sua altura acima.",
			sharedLoaded: "Resultado compartilhado carregado", openedShared: "Você abriu um resultado compartilhado. Ele já está salvo neste navegador.", linkUnreadable: "Não foi possível ler esse link.",
			refCategory: "Classificação", refWho: "Padrão da OMS", refIndia: "", refAsian: "Asiática", refAndOver: "{n} ou mais",
			refClasses: "Graus de obesidade da OMS: grau I 30 – 34,9, grau II 35 – 39,9, grau III 40 ou mais.",
			dotTitle: "{d}: IMC {b}, {w}",
			cats: cats(["Magreza grave", "Magreza moderada", "Magreza leve", "Peso normal", "Sobrepeso", "Obesidade grau I", "Obesidade grau II", "Obesidade grau III", "Obesidade", "Abaixo do peso"])
		},
		id: {
			code: "id", name: "Bahasa Indonesia", path: "/kalkulator-bmi", locale: "id-ID", dec: ",", langLabel: "Bahasa", defScale: "who", defUnits: "m", dir: "ltr",
			meta: { title: "Kalkulator BMI", tag: "Indeks massa tubuh (IMT), berat badan ideal dan perkembangannya.", h1: "Kalkulator BMI (Indeks Massa Tubuh / IMT)", docTitle: "Kalkulator BMI: Hitung IMT (Indeks Massa Tubuh) | MES", ogLocale: "id_ID",
				desc: "Kalkulator BMI gratis: masukkan berat badan (kg) dan tinggi badan (cm) untuk menghitung IMT Anda, kategorinya menurut WHO atau standar Asia, berat badan ideal, dan berapa kg yang perlu naik atau turun." },
			mixUnits: "<b>Bebas pilih satuan:</b> tulis berat badan dalam kilogram atau pon dan tinggi badan dalam sentimeter atau kaki dan inci; kolom lainnya terisi otomatis saat Anda mengetik.",
			weight: "Berat badan", height: "Tinggi badan", phKg: "mis. 60,5", phCm: "mis. 165", phLb: "mis. 133", phFt: "mis. 5", phIn: "mis. 5",
			hideOptions: "Sembunyikan opsi", options: "Opsi",
			showResultsIn: "Tampilkan hasil dalam", both: "Keduanya", metric: "Metrik", us: "AS",
			bmiScale: "Skala BMI", scaleWho: "Standar WHO (berlebih mulai 25)", scaleAsia: "Asia (berlebih mulai 23)", scaleIndia: "",
			scaleHint: "Pada orang Asia, risiko kesehatan sudah naik pada IMT yang lebih rendah, jadi banyak dokter di Indonesia memakai skala Asia (WHO Asia-Pasifik). Pilih skala di atas.",
			stepNote: "Setiap kolom selalu sama dengan pasangannya. Hanya untuk orang dewasa usia 20 tahun ke atas; lihat catatan di bawah.",
			emptyPrompt: "Masukkan berat dan tinggi badan Anda untuk melihat BMI, atau coba contoh: ",
			copyLink: "Salin tautan hasil ini", saveMeasurement: "Simpan pengukuran ini", print: "Cetak", whereScale: "Posisi Anda pada skala",
			myMeasurements: "Pengukuran saya", date: "Tanggal", noteOpt: "Catatan (opsional)", notePh: "mis. setelah liburan", save: "Simpan", cancel: "Batal",
			chartAria: "Grafik BMI tersimpan Anda dari waktu ke waktu", copyCsv: "Salin sebagai tabel spreadsheet", copyLinkAll: "Salin tautan beserta riwayat saya",
			storeBlocked: "Browser Anda memblokir penyimpanan, jadi pengukuran Anda akan hilang saat tab ini ditutup. Salin tautan untuk menyimpannya.",
			saved: { other: "{n} pengukuran tersimpan di browser ini." },
			copyFailed: "Gagal menyalin", copiedBtn: "Tersalin ✓",
			sumResults: "Hasil dalam {u} · {s}", unitsUS: "satuan AS", unitsMetric: "satuan metrik", unitsBoth: "kedua satuan", scaleShortWho: "skala WHO", scaleShortIndia: "", scaleShortAsia: "skala Asia",
			examples: [["160 cm, 55 kg", "55", "160"], ["160 cm, 60 kg", "60", "160"], ["170 cm, 80 kg", "80", "170"]],
			yourBmi: "BMI Anda", healthyWeight: "Berat badan sehat untuk tinggi Anda", bmiRange: "BMI {lo} sampai {hi}", bmiPrime: "BMI Prime", primeSub: "BMI Anda &divide; {hi} (1,00 atau kurang berarti normal)",
			ponderal: "Indeks Ponderal", ponderalSub: "kg per m&sup3; (alternatif untuk orang yang sangat tinggi atau sangat pendek)",
			verdictNormal: "Berat badan Anda <b>normal</b>. Bagus! Rentang berat badan sehat untuk tinggi ini adalah {lo} sampai {hi}.",
			verdictGain: "Kategori Anda: <b>{catl}</b>. Untuk mencapai berat badan normal, Anda perlu menaikkan berat badan <b>{min}</b> sampai <b>{max}</b>.",
			verdictLose: "Kategori Anda: <b>{catl}</b>. Untuk mencapai berat badan normal, Anda perlu menurunkan berat badan <b>{min}</b> sampai <b>{max}</b>.",
			verdictSmall: "BMI adalah alat skrining, bukan diagnosis. BMI tidak memperhitungkan otot, bentuk tubuh, usia, atau etnis.",
			enterFirst: "Masukkan berat dan tinggi badan dulu", pickDate: "Pilih tanggal", savedOn: "Tersimpan: {d}",
			thDate: "Tanggal", thWeight: "Berat", thBmi: "BMI", thCategory: "Kategori", thNote: "Catatan", deleteAria: "Hapus pengukuran tanggal {d}",
			chartMore: "Simpan satu pengukuran lagi untuk melihat perkembangan BMI Anda.", entryDeleted: "Pengukuran dihapus.", undo: "Urungkan",
			csvHeader: "Tanggal\tBerat (kg)\tTinggi (cm)\tBMI\tCatatan", csvCopied: "Tersalin: tempel di spreadsheet",
			linkCopied: "Tautan tersalin", linkCopiedAll: "Tautan tersalin: berisi seluruh riwayat Anda",
			loadingOld: "Memuat perhitungan dari tautan Anda…", oldFailed: "Tautan lama itu tidak bisa dimuat (mungkin sudah kedaluwarsa). Masukkan berat dan tinggi badan di atas.",
			sharedLoaded: "Hasil yang dibagikan sudah dimuat", openedShared: "Anda membuka hasil yang dibagikan. Sekarang hasil ini tersimpan di browser ini.", linkUnreadable: "Tautan itu tidak bisa dibaca.",
			refCategory: "Kategori", refWho: "Standar WHO", refIndia: "", refAsian: "Asia", refAndOver: "{n} ke atas",
			refClasses: "Kelas obesitas WHO: kelas I 30 – 34,9, kelas II 35 – 39,9, kelas III 40 ke atas.",
			dotTitle: "{d}: BMI {b}, {w}",
			cats: cats(["Kurus berat", "Kurus sedang", "Kurus ringan", "Berat badan normal", "Berat badan berlebih", "Obesitas kelas I", "Obesitas kelas II", "Obesitas kelas III", "Obesitas", "Berat badan kurang"])
		},
		fr: {
			code: "fr", name: "Français", path: "/calcul-imc", locale: "fr-FR", dec: ",", langLabel: "Langue", defScale: "who", defUnits: "m", dir: "ltr",
			meta: { title: "Calcul IMC", tag: "Indice de masse corporelle, poids de forme et suivi.", h1: "Calcul de l’IMC (indice de masse corporelle)", docTitle: "Calcul IMC : calculer son indice de masse corporelle | MES", ogLocale: "fr_FR",
				desc: "Calculez votre IMC gratuitement : entrez votre poids en kg et votre taille en cm pour connaître votre indice de masse corporelle, votre catégorie selon l’OMS, votre poids santé et combien de kilos prendre ou perdre." },
			mixUnits: "<b>Mélangez les unités comme vous voulez :</b> saisissez le poids en kilos ou en livres et la taille en centimètres ou en pieds et pouces ; les autres champs se remplissent pendant la saisie.",
			weight: "Poids", height: "Taille", phKg: "ex. 68,5", phCm: "ex. 170", phLb: "ex. 151", phFt: "ex. 5", phIn: "ex. 7",
			hideOptions: "Masquer les options", options: "Options",
			showResultsIn: "Afficher les résultats en", both: "Les deux", metric: "Métrique", us: "US",
			bmiScale: "Échelle d’IMC", scaleWho: "Standard OMS (surpoids dès 25)", scaleAsia: "Asiatique (surpoids dès 23)", scaleIndia: "", scaleHint: "",
			stepNote: "Chaque champ reste synchronisé avec son équivalent. Adultes de 20 ans et plus uniquement ; voir les remarques plus bas.",
			emptyPrompt: "Entrez votre poids et votre taille pour voir votre IMC, ou essayez un exemple : ",
			copyLink: "Copier le lien de ce résultat", saveMeasurement: "Enregistrer cette mesure", print: "Imprimer", whereScale: "Votre position sur l’échelle",
			myMeasurements: "Mes mesures", date: "Date", noteOpt: "Note (facultatif)", notePh: "ex. après les vacances", save: "Enregistrer", cancel: "Annuler",
			chartAria: "Graphique de votre IMC enregistré au fil du temps", copyCsv: "Copier comme tableau pour tableur", copyLinkAll: "Copier le lien avec mon historique",
			storeBlocked: "Votre navigateur bloque le stockage : vos mesures seront perdues à la fermeture de cet onglet. Copiez un lien pour les garder.",
			saved: { one: "{n} mesure enregistrée dans ce navigateur.", other: "{n} mesures enregistrées dans ce navigateur." },
			copyFailed: "Échec de la copie", copiedBtn: "Copié ✓",
			sumResults: "Résultats en {u} · {s}", unitsUS: "unités US", unitsMetric: "système métrique", unitsBoth: "deux systèmes", scaleShortWho: "échelle OMS", scaleShortIndia: "", scaleShortAsia: "échelle asiatique",
			examples: [["170 cm, 65 kg", "65", "170"], ["160 cm, 72 kg", "72", "160"], ["180 cm, 92 kg", "92", "180"]],
			yourBmi: "Votre IMC", healthyWeight: "Poids santé pour votre taille", bmiRange: "IMC de {lo} à {hi}", bmiPrime: "IMC Prime", primeSub: "votre IMC &divide; {hi} (1,00 ou moins = dans la norme)",
			ponderal: "Indice pondéral", ponderalSub: "kg par m&sup3; (une alternative adaptée aux personnes très grandes ou très petites)",
			verdictNormal: "Votre <b>poids est normal</b>. Bravo ! Votre fourchette de poids santé pour cette taille va de {lo} à {hi}.",
			verdictGain: "Votre catégorie : <b>{catl}</b>. Pour atteindre un poids normal, il faudrait prendre entre <b>{min}</b> et <b>{max}</b>.",
			verdictLose: "Votre catégorie : <b>{catl}</b>. Pour atteindre un poids normal, il faudrait perdre entre <b>{min}</b> et <b>{max}</b>.",
			verdictSmall: "L’IMC est un outil de dépistage, pas un diagnostic. Il ne tient compte ni de la masse musculaire, ni de la morphologie, ni de l’âge, ni de l’origine.",
			enterFirst: "Entrez d’abord votre poids et votre taille", pickDate: "Choisissez une date", savedOn: "Enregistré : {d}",
			thDate: "Date", thWeight: "Poids", thBmi: "IMC", thCategory: "Catégorie", thNote: "Note", deleteAria: "Supprimer la mesure du {d}",
			chartMore: "Enregistrez une autre mesure pour voir l’évolution de votre IMC.", entryDeleted: "Mesure supprimée.", undo: "Annuler",
			csvHeader: "Date\tPoids (kg)\tTaille (cm)\tIMC\tNote", csvCopied: "Copié : collez-le dans un tableur",
			linkCopied: "Lien copié", linkCopiedAll: "Lien copié : il contient tout votre historique",
			loadingOld: "Chargement du calcul depuis votre lien…", oldFailed: "Ce lien ancien n’a pas pu être chargé (il a peut-être expiré). Entrez votre poids et votre taille ci-dessus.",
			sharedLoaded: "Résultat partagé chargé", openedShared: "Vous avez ouvert un résultat partagé. Il est maintenant enregistré dans ce navigateur.", linkUnreadable: "Ce lien n’a pas pu être lu.",
			refCategory: "Catégorie", refWho: "Standard OMS", refIndia: "", refAsian: "Asiatique", refAndOver: "{n} et plus",
			refClasses: "Classes d’obésité de l’OMS : classe I 30 – 34,9, classe II 35 – 39,9, classe III 40 et plus.",
			dotTitle: "{d} : IMC {b}, {w}",
			cats: cats(["Maigreur sévère", "Maigreur modérée", "Maigreur légère", "Poids normal", "Surpoids", "Obésité (classe I)", "Obésité (classe II)", "Obésité (classe III)", "Obésité", "Insuffisance pondérale"])
		},
		de: {
			code: "de", name: "Deutsch", path: "/bmi-rechner", locale: "de-DE", dec: ",", langLabel: "Sprache", defScale: "who", defUnits: "m", dir: "ltr",
			meta: { title: "BMI-Rechner", tag: "Body-Mass-Index, Normalgewicht und Verlauf.", h1: "BMI-Rechner: Body-Mass-Index berechnen", docTitle: "BMI-Rechner: Body-Mass-Index berechnen | MES", ogLocale: "de_DE",
				desc: "Kostenloser BMI-Rechner: Gewicht in kg und Größe in cm eingeben und Body-Mass-Index, WHO-Kategorie, Normalgewicht für Ihre Größe und die nötige Zu- oder Abnahme sehen." },
			mixUnits: "<b>Einheiten frei kombinieren:</b> Gewicht in Kilogramm oder Pfund und Größe in Zentimetern oder Fuß und Zoll eingeben; die übrigen Felder füllen sich beim Tippen von selbst.",
			weight: "Gewicht", height: "Größe", phKg: "z. B. 68,5", phCm: "z. B. 170", phLb: "z. B. 151", phFt: "z. B. 5", phIn: "z. B. 7",
			hideOptions: "Optionen ausblenden", options: "Optionen",
			showResultsIn: "Ergebnisse anzeigen in", both: "Beides", metric: "Metrisch", us: "US",
			bmiScale: "BMI-Skala", scaleWho: "WHO-Standard (Übergewicht ab 25)", scaleAsia: "Asiatisch (Übergewicht ab 23)", scaleIndia: "", scaleHint: "",
			stepNote: "Jedes Feld bleibt mit seinem Gegenstück synchron. Nur für Erwachsene ab 20 Jahren; siehe die Hinweise unten.",
			emptyPrompt: "Geben Sie Gewicht und Größe ein, um Ihren BMI zu sehen, oder probieren Sie ein Beispiel: ",
			copyLink: "Link zu diesem Ergebnis kopieren", saveMeasurement: "Diese Messung speichern", print: "Drucken", whereScale: "Ihre Position auf der Skala",
			myMeasurements: "Meine Messungen", date: "Datum", noteOpt: "Notiz (optional)", notePh: "z. B. nach dem Urlaub", save: "Speichern", cancel: "Abbrechen",
			chartAria: "Diagramm Ihres gespeicherten BMI im Zeitverlauf", copyCsv: "Als Tabelle kopieren", copyLinkAll: "Link mit meinem Verlauf kopieren",
			storeBlocked: "Ihr Browser blockiert den Speicher, daher gehen Ihre Messungen beim Schließen dieses Tabs verloren. Kopieren Sie einen Link, um sie zu behalten.",
			saved: { one: "{n} Messung in diesem Browser gespeichert.", other: "{n} Messungen in diesem Browser gespeichert." },
			copyFailed: "Kopieren fehlgeschlagen", copiedBtn: "Kopiert ✓",
			sumResults: "Ergebnisse in {u} · {s}", unitsUS: "US-Einheiten", unitsMetric: "metrischen Einheiten", unitsBoth: "beiden Systemen", scaleShortWho: "WHO-Skala", scaleShortIndia: "", scaleShortAsia: "asiatische Skala",
			examples: [["170 cm, 65 kg", "65", "170"], ["165 cm, 78 kg", "78", "165"], ["185 cm, 98 kg", "98", "185"]],
			yourBmi: "Ihr BMI", healthyWeight: "Normalgewicht für Ihre Größe", bmiRange: "BMI {lo} bis {hi}", bmiPrime: "BMI Prime", primeSub: "Ihr BMI &divide; {hi} (1,00 oder weniger liegt im Normbereich)",
			ponderal: "Ponderal-Index", ponderalSub: "kg pro m&sup3; (eine Alternative für sehr große oder sehr kleine Menschen)",
			verdictNormal: "Sie haben <b>Normalgewicht</b>. Sehr gut! Ihr gesunder Bereich bei dieser Größe liegt bei {lo} bis {hi}.",
			verdictGain: "Ihre Kategorie: <b>{cat}</b>. Um Normalgewicht zu erreichen, müssten Sie zwischen <b>{min}</b> und <b>{max}</b> zunehmen.",
			verdictLose: "Ihre Kategorie: <b>{cat}</b>. Um Normalgewicht zu erreichen, müssten Sie zwischen <b>{min}</b> und <b>{max}</b> abnehmen.",
			verdictSmall: "Der BMI ist ein grober Richtwert, keine Diagnose. Muskelmasse, Körperbau, Alter und Herkunft berücksichtigt er nicht.",
			enterFirst: "Geben Sie zuerst Gewicht und Größe ein", pickDate: "Wählen Sie ein Datum", savedOn: "Gespeichert: {d}",
			thDate: "Datum", thWeight: "Gewicht", thBmi: "BMI", thCategory: "Kategorie", thNote: "Notiz", deleteAria: "Messung vom {d} löschen",
			chartMore: "Speichern Sie eine weitere Messung, um Ihren BMI-Verlauf zu sehen.", entryDeleted: "Messung gelöscht.", undo: "Rückgängig",
			csvHeader: "Datum\tGewicht (kg)\tGröße (cm)\tBMI\tNotiz", csvCopied: "Kopiert: in eine Tabelle einfügen",
			linkCopied: "Link kopiert", linkCopiedAll: "Link kopiert: Er enthält Ihren gesamten Verlauf",
			loadingOld: "Die Berechnung aus Ihrem Link wird geladen…", oldFailed: "Dieser alte Link konnte nicht geladen werden (vielleicht ist er abgelaufen). Geben Sie oben Gewicht und Größe ein.",
			sharedLoaded: "Geteiltes Ergebnis geladen", openedShared: "Sie haben ein geteiltes Ergebnis geöffnet. Es ist jetzt in diesem Browser gespeichert.", linkUnreadable: "Dieser Link konnte nicht gelesen werden.",
			refCategory: "Kategorie", refWho: "WHO-Standard", refIndia: "", refAsian: "Asiatisch", refAndOver: "ab {n}",
			refClasses: "Adipositas-Grade der WHO: Grad I 30 – 34,9, Grad II 35 – 39,9, Grad III ab 40.",
			dotTitle: "{d}: BMI {b}, {w}",
			cats: cats(["Starkes Untergewicht", "Mäßiges Untergewicht", "Leichtes Untergewicht", "Normalgewicht", "Übergewicht", "Adipositas Grad I", "Adipositas Grad II", "Adipositas Grad III", "Adipositas", "Untergewicht"])
		},
		it: {
			code: "it", name: "Italiano", path: "/calcolo-bmi", locale: "it-IT", dec: ",", langLabel: "Lingua", defScale: "who", defUnits: "m", dir: "ltr",
			meta: { title: "Calcolo BMI", tag: "Indice di massa corporea, peso forma e andamento.", h1: "Calcolo BMI (IMC, indice di massa corporea)", docTitle: "Calcolo BMI: calcola il tuo indice di massa corporea (IMC) | MES", ogLocale: "it_IT",
				desc: "Calcola il BMI gratis: inserisci peso in kg e altezza in cm per conoscere il tuo indice di massa corporea (IMC), la categoria OMS, il tuo peso forma e quanti chili prendere o perdere." },
			mixUnits: "<b>Combina le unità come vuoi:</b> inserisci il peso in chili o libbre e l’altezza in centimetri o in piedi e pollici; gli altri campi si compilano mentre scrivi.",
			weight: "Peso", height: "Altezza", phKg: "es. 68,5", phCm: "es. 170", phLb: "es. 151", phFt: "es. 5", phIn: "es. 7",
			hideOptions: "Nascondi opzioni", options: "Opzioni",
			showResultsIn: "Mostra i risultati in", both: "Entrambi", metric: "Metrico", us: "USA",
			bmiScale: "Scala del BMI", scaleWho: "Standard OMS (sovrappeso da 25)", scaleAsia: "Asiatica (sovrappeso da 23)", scaleIndia: "", scaleHint: "",
			stepNote: "Ogni campo resta allineato al suo corrispondente. Solo per adulti dai 20 anni in su; vedi le note più in basso.",
			emptyPrompt: "Inserisci peso e altezza per vedere il tuo BMI, oppure prova un esempio: ",
			copyLink: "Copia il link a questo risultato", saveMeasurement: "Salva questa misurazione", print: "Stampa", whereScale: "Dove ti trovi sulla scala",
			myMeasurements: "Le mie misurazioni", date: "Data", noteOpt: "Nota (facoltativa)", notePh: "es. dopo le vacanze", save: "Salva", cancel: "Annulla",
			chartAria: "Grafico del tuo BMI salvato nel tempo", copyCsv: "Copia come tabella per foglio di calcolo", copyLinkAll: "Copia il link con il mio storico",
			storeBlocked: "Il browser sta bloccando la memoria locale, quindi le misurazioni andranno perse alla chiusura di questa scheda. Copia un link per conservarle.",
			saved: { one: "{n} misurazione salvata in questo browser.", other: "{n} misurazioni salvate in questo browser." },
			copyFailed: "Copia non riuscita", copiedBtn: "Copiato ✓",
			sumResults: "Risultati in {u} · {s}", unitsUS: "unità USA", unitsMetric: "sistema metrico", unitsBoth: "entrambi i sistemi", scaleShortWho: "scala OMS", scaleShortIndia: "", scaleShortAsia: "scala asiatica",
			examples: [["170 cm, 65 kg", "65", "170"], ["160 cm, 72 kg", "72", "160"], ["180 cm, 92 kg", "92", "180"]],
			yourBmi: "Il tuo BMI", healthyWeight: "Peso forma per la tua altezza", bmiRange: "BMI da {lo} a {hi}", bmiPrime: "BMI Prime", primeSub: "il tuo BMI &divide; {hi} (1,00 o meno è nella norma)",
			ponderal: "Indice ponderale", ponderalSub: "kg per m&sup3; (un’alternativa adatta a persone molto alte o molto basse)",
			verdictNormal: "Hai un <b>peso normale</b>. Ottimo! Il tuo intervallo di peso sano per questa altezza va da {lo} a {hi}.",
			verdictGain: "La tua categoria: <b>{catl}</b>. Per raggiungere un peso normale dovresti prendere tra <b>{min}</b> e <b>{max}</b>.",
			verdictLose: "La tua categoria: <b>{catl}</b>. Per raggiungere un peso normale dovresti perdere tra <b>{min}</b> e <b>{max}</b>.",
			verdictSmall: "Il BMI è uno strumento di screening, non una diagnosi. Non tiene conto di muscoli, corporatura, età né etnia.",
			enterFirst: "Inserisci prima peso e altezza", pickDate: "Scegli una data", savedOn: "Salvato: {d}",
			thDate: "Data", thWeight: "Peso", thBmi: "BMI", thCategory: "Categoria", thNote: "Nota", deleteAria: "Elimina la misurazione del {d}",
			chartMore: "Salva un’altra misurazione per vedere l’andamento del tuo BMI.", entryDeleted: "Misurazione eliminata.", undo: "Annulla",
			csvHeader: "Data\tPeso (kg)\tAltezza (cm)\tBMI\tNota", csvCopied: "Copiato: incollalo in un foglio di calcolo",
			linkCopied: "Link copiato", linkCopiedAll: "Link copiato: contiene tutto il tuo storico",
			loadingOld: "Caricamento del calcolo dal link condiviso…", oldFailed: "Non è stato possibile caricare quel vecchio link (forse è scaduto). Inserisci peso e altezza qui sopra.",
			sharedLoaded: "Risultato condiviso caricato", openedShared: "Hai aperto un risultato condiviso. Ora è salvato in questo browser.", linkUnreadable: "Non è stato possibile leggere quel link.",
			refCategory: "Categoria", refWho: "Standard OMS", refIndia: "", refAsian: "Asiatica", refAndOver: "{n} e oltre",
			refClasses: "Classi di obesità dell’OMS: classe I 30 – 34,9, classe II 35 – 39,9, classe III 40 e oltre.",
			dotTitle: "{d}: BMI {b}, {w}",
			cats: cats(["Magrezza grave", "Magrezza moderata", "Magrezza lieve", "Normopeso", "Sovrappeso", "Obesità di classe I", "Obesità di classe II", "Obesità di classe III", "Obesità", "Sottopeso"])
		},
		tr: {
			code: "tr", name: "Türkçe", path: "/vucut-kitle-indeksi", locale: "tr-TR", dec: ",", langLabel: "Dil", defScale: "who", defUnits: "m", dir: "ltr",
			meta: { title: "VKİ Hesaplama", tag: "Vücut kitle indeksi, ideal kilo aralığı ve gelişim takibi.", h1: "Vücut Kitle İndeksi (VKİ) Hesaplama", docTitle: "Vücut Kitle İndeksi Hesaplama (VKİ / BMI) | MES", ogLocale: "tr_TR",
				desc: "Ücretsiz vücut kitle indeksi hesaplama: kilonuzu (kg) ve boyunuzu (cm) girin; VKİ değerinizi, Dünya Sağlık Örgütü sınıfınızı, ideal kilo aralığınızı ve kaç kilo almanız ya da vermeniz gerektiğini görün." },
			mixUnits: "<b>Birimleri dilediğiniz gibi karıştırın:</b> kilonuzu kilogram ya da libre, boyunuzu santimetre ya da fit ve inç olarak yazın; siz yazdıkça diğer alanlar kendiliğinden dolar.",
			weight: "Kilo", height: "Boy", phKg: "örn. 68,5", phCm: "örn. 170", phLb: "örn. 151", phFt: "örn. 5", phIn: "örn. 7",
			hideOptions: "Seçenekleri gizle", options: "Seçenekler",
			showResultsIn: "Sonuç birimi", both: "İkisi de", metric: "Metrik", us: "ABD",
			bmiScale: "VKİ ölçeği", scaleWho: "DÜÖ standardı (25’ten itibaren fazla kilolu)", scaleAsia: "Asya (23’ten itibaren fazla kilolu)", scaleIndia: "", scaleHint: "",
			stepNote: "Her alan karşılığıyla eşzamanlı kalır. Yalnızca 20 yaş ve üstü yetişkinler içindir; aşağıdaki notlara bakın.",
			emptyPrompt: "VKİ değerinizi görmek için kilonuzu ve boyunuzu girin ya da bir örnek deneyin: ",
			copyLink: "Bu sonucun bağlantısını kopyala", saveMeasurement: "Bu ölçümü kaydet", print: "Yazdır", whereScale: "Ölçekteki yeriniz",
			myMeasurements: "Ölçümlerim", date: "Tarih", noteOpt: "Not (isteğe bağlı)", notePh: "örn. tatilden sonra", save: "Kaydet", cancel: "İptal",
			chartAria: "Kaydedilmiş VKİ değerlerinizin zaman içindeki grafiği", copyCsv: "Tablo olarak kopyala", copyLinkAll: "Geçmişimle birlikte bağlantıyı kopyala",
			storeBlocked: "Tarayıcınız depolamayı engelliyor, bu yüzden bu sekmeyi kapattığınızda ölçümleriniz kaybolacak. Saklamak için bir bağlantı kopyalayın.",
			saved: { one: "Bu tarayıcıda {n} ölçüm kayıtlı.", other: "Bu tarayıcıda {n} ölçüm kayıtlı." },
			copyFailed: "Kopyalanamadı", copiedBtn: "Kopyalandı ✓",
			sumResults: "Sonuçlar: {u} · {s}", unitsUS: "ABD birimleri", unitsMetric: "metrik birimler", unitsBoth: "iki birim de", scaleShortWho: "DÜÖ ölçeği", scaleShortIndia: "", scaleShortAsia: "Asya ölçeği",
			examples: [["170 cm, 65 kg", "65", "170"], ["160 cm, 72 kg", "72", "160"], ["180 cm, 95 kg", "95", "180"]],
			yourBmi: "VKİ değeriniz", healthyWeight: "Boyunuza göre sağlıklı kilo", bmiRange: "VKİ {lo} ile {hi} arası", bmiPrime: "BMI Prime", primeSub: "VKİ &divide; {hi} (1,00 veya altı normal aralıktadır)",
			ponderal: "Ponderal İndeks", ponderalSub: "m&sup3; başına kg (çok uzun veya çok kısa kişiler için bir alternatif)",
			verdictNormal: "Kilonuz <b>normal</b>. Tebrikler! Bu boy için sağlıklı aralığınız {lo} ile {hi} arasıdır.",
			verdictGain: "Sınıfınız: <b>{cat}</b>. Normal kiloya ulaşmak için <b>{min}</b> ile <b>{max}</b> arasında kilo almanız gerekir.",
			verdictLose: "Sınıfınız: <b>{cat}</b>. Normal kiloya ulaşmak için <b>{min}</b> ile <b>{max}</b> arasında kilo vermeniz gerekir.",
			verdictSmall: "VKİ bir tarama aracıdır, tanı değildir. Kas kütlesini, vücut yapısını, yaşı ve etnik kökeni hesaba katmaz.",
			enterFirst: "Önce kilonuzu ve boyunuzu girin", pickDate: "Bir tarih seçin", savedOn: "Kaydedildi: {d}",
			thDate: "Tarih", thWeight: "Kilo", thBmi: "VKİ", thCategory: "Sınıf", thNote: "Not", deleteAria: "{d} tarihli ölçümü sil",
			chartMore: "VKİ değişiminizi görmek için bir ölçüm daha kaydedin.", entryDeleted: "Ölçüm silindi.", undo: "Geri al",
			csvHeader: "Tarih\tKilo (kg)\tBoy (cm)\tVKİ\tNot", csvCopied: "Kopyalandı: bir tabloya yapıştırın",
			linkCopied: "Bağlantı kopyalandı", linkCopiedAll: "Bağlantı kopyalandı: tüm geçmişinizi içerir",
			loadingOld: "Paylaşılan bağlantıdaki hesap yükleniyor…", oldFailed: "Bu eski bağlantı yüklenemedi (süresi dolmuş olabilir). Kilonuzu ve boyunuzu yukarıya girin.",
			sharedLoaded: "Paylaşılan sonuç yüklendi", openedShared: "Paylaşılan bir sonucu açtınız. Artık bu tarayıcıda kayıtlı.", linkUnreadable: "Bu bağlantı okunamadı.",
			refCategory: "Sınıf", refWho: "DÜÖ standardı", refIndia: "", refAsian: "Asya", refAndOver: "{n} ve üzeri",
			refClasses: "DÜÖ obezite sınıfları: 1. derece 30 – 34,9, 2. derece 35 – 39,9, 3. derece 40 ve üzeri.",
			dotTitle: "{d}: VKİ {b}, {w}",
			cats: cats(["İleri derecede zayıf", "Orta derecede zayıf", "Hafif zayıf", "Normal kilolu", "Fazla kilolu", "1. derece obez", "2. derece obez", "3. derece obez (morbid obez)", "Obez", "Zayıf"])
		},
		vi: {
			code: "vi", name: "Tiếng Việt", path: "/tinh-chi-so-bmi", locale: "vi-VN", dec: ",", langLabel: "Ngôn ngữ", defScale: "asia", defUnits: "m", dir: "ltr",
			meta: { title: "Tính chỉ số BMI", tag: "Chỉ số khối cơ thể, cân nặng lý tưởng và theo dõi.", h1: "Tính chỉ số BMI (chỉ số khối cơ thể)", docTitle: "Tính chỉ số BMI online: chuẩn châu Á và WHO | MES", ogLocale: "vi_VN",
				desc: "Tính chỉ số BMI miễn phí: nhập cân nặng (kg) và chiều cao (cm) để biết chỉ số khối cơ thể, phân loại theo chuẩn châu Á hoặc WHO, cân nặng lý tưởng và số kg cần tăng hoặc giảm." },
			mixUnits: "<b>Dùng đơn vị nào cũng được:</b> nhập cân nặng theo kg hoặc pound, chiều cao theo cm hoặc feet và inch; các ô còn lại tự điền khi bạn gõ.",
			weight: "Cân nặng", height: "Chiều cao", phKg: "vd. 55,5", phCm: "vd. 160", phLb: "vd. 122", phFt: "vd. 5", phIn: "vd. 3",
			hideOptions: "Ẩn tùy chọn", options: "Tùy chọn",
			showResultsIn: "Hiển thị kết quả theo", both: "Cả hai", metric: "Hệ mét", us: "Hệ Mỹ",
			bmiScale: "Thang BMI", scaleWho: "Chuẩn WHO (thừa cân từ 25)", scaleAsia: "Chuẩn châu Á (thừa cân từ 23)", scaleIndia: "",
			scaleHint: "Người châu Á có nguy cơ sức khỏe cao hơn ở cùng mức BMI, nên chuẩn châu Á của WHO (thừa cân từ 23, béo phì từ 27,5) được dùng mặc định ở đây. Bạn có thể chuyển sang chuẩn WHO ở trên.",
			stepNote: "Mỗi ô luôn khớp với ô tương ứng. Chỉ dành cho người trưởng thành từ 20 tuổi; xem lưu ý bên dưới.",
			emptyPrompt: "Nhập cân nặng và chiều cao để xem chỉ số BMI, hoặc thử một ví dụ: ",
			copyLink: "Sao chép liên kết kết quả này", saveMeasurement: "Lưu lần đo này", print: "In", whereScale: "Vị trí của bạn trên thang",
			myMeasurements: "Các lần đo của tôi", date: "Ngày", noteOpt: "Ghi chú (không bắt buộc)", notePh: "vd. sau kỳ nghỉ", save: "Lưu", cancel: "Hủy",
			chartAria: "Biểu đồ BMI đã lưu của bạn theo thời gian", copyCsv: "Sao chép dạng bảng tính", copyLinkAll: "Sao chép liên kết kèm lịch sử",
			storeBlocked: "Trình duyệt đang chặn bộ nhớ, nên các lần đo sẽ mất khi bạn đóng thẻ này. Hãy sao chép liên kết để giữ lại.",
			saved: { other: "Đã lưu {n} lần đo trong trình duyệt này." },
			copyFailed: "Không sao chép được", copiedBtn: "Đã sao chép ✓",
			sumResults: "Kết quả theo {u} · {s}", unitsUS: "đơn vị Mỹ", unitsMetric: "hệ mét", unitsBoth: "cả hai hệ", scaleShortWho: "chuẩn WHO", scaleShortIndia: "", scaleShortAsia: "chuẩn châu Á",
			examples: [["160 cm, 50 kg", "50", "160"], ["160 cm, 60 kg", "60", "160"], ["170 cm, 80 kg", "80", "170"]],
			yourBmi: "BMI của bạn", healthyWeight: "Cân nặng khỏe mạnh theo chiều cao", bmiRange: "BMI từ {lo} đến {hi}", bmiPrime: "BMI Prime", primeSub: "BMI của bạn &divide; {hi} (từ 1,00 trở xuống là bình thường)",
			ponderal: "Chỉ số Ponderal", ponderalSub: "kg trên m&sup3; (phù hợp hơn với người rất cao hoặc rất thấp)",
			verdictNormal: "Bạn có <b>cân nặng bình thường</b>. Tuyệt vời! Khoảng cân nặng khỏe mạnh ở chiều cao này là từ {lo} đến {hi}.",
			verdictGain: "Phân loại của bạn: <b>{catl}</b>. Để đạt cân nặng bình thường, bạn cần tăng từ <b>{min}</b> đến <b>{max}</b>.",
			verdictLose: "Phân loại của bạn: <b>{catl}</b>. Để đạt cân nặng bình thường, bạn cần giảm từ <b>{min}</b> đến <b>{max}</b>.",
			verdictSmall: "BMI là công cụ sàng lọc, không phải chẩn đoán. Chỉ số này không tính đến cơ bắp, vóc dáng, tuổi hay chủng tộc.",
			enterFirst: "Hãy nhập cân nặng và chiều cao trước", pickDate: "Chọn một ngày", savedOn: "Đã lưu {d}",
			thDate: "Ngày", thWeight: "Cân nặng", thBmi: "BMI", thCategory: "Phân loại", thNote: "Ghi chú", deleteAria: "Xóa lần đo ngày {d}",
			chartMore: "Lưu thêm một lần đo để xem BMI thay đổi theo thời gian.", entryDeleted: "Đã xóa lần đo.", undo: "Hoàn tác",
			csvHeader: "Ngày\tCân nặng (kg)\tChiều cao (cm)\tBMI\tGhi chú", csvCopied: "Đã sao chép: dán vào bảng tính",
			linkCopied: "Đã sao chép liên kết", linkCopiedAll: "Đã sao chép liên kết: chứa toàn bộ lịch sử của bạn",
			loadingOld: "Đang tải phép tính từ liên kết…", oldFailed: "Không tải được liên kết cũ đó (có thể đã hết hạn). Hãy nhập cân nặng và chiều cao ở trên.",
			sharedLoaded: "Đã tải kết quả được chia sẻ", openedShared: "Bạn vừa mở một kết quả được chia sẻ. Kết quả đã được lưu trong trình duyệt này.", linkUnreadable: "Không đọc được liên kết đó.",
			refCategory: "Phân loại", refWho: "Chuẩn WHO", refIndia: "", refAsian: "Chuẩn châu Á", refAndOver: "từ {n} trở lên",
			refClasses: "Các mức béo phì theo WHO: độ I 30 – 34,9, độ II 35 – 39,9, độ III từ 40 trở lên.",
			dotTitle: "{d}: BMI {b}, {w}",
			cats: cats(["Gầy độ III", "Gầy độ II", "Gầy độ I", "Bình thường", "Thừa cân", "Béo phì độ I", "Béo phì độ II", "Béo phì độ III", "Béo phì", "Thiếu cân"])
		},
		pl: {
			code: "pl", name: "Polski", path: "/kalkulator-bmi-pl", locale: "pl-PL", dec: ",", langLabel: "Język", defScale: "who", defUnits: "m", dir: "ltr",
			meta: { title: "Kalkulator BMI", tag: "Wskaźnik masy ciała, prawidłowa waga i postępy.", h1: "Kalkulator BMI: oblicz wskaźnik masy ciała", docTitle: "Kalkulator BMI: oblicz wskaźnik masy ciała | MES", ogLocale: "pl_PL",
				desc: "Darmowy kalkulator BMI: podaj wagę w kg i wzrost w cm, aby poznać swój wskaźnik masy ciała, kategorię według WHO, prawidłową wagę dla swojego wzrostu i ile kilogramów przytyć lub schudnąć." },
			mixUnits: "<b>Dowolnie łącz jednostki:</b> wpisz wagę w kilogramach lub funtach, a wzrost w centymetrach albo w stopach i calach; pozostałe pola wypełniają się same podczas pisania.",
			weight: "Waga", height: "Wzrost", phKg: "np. 68,5", phCm: "np. 170", phLb: "np. 151", phFt: "np. 5", phIn: "np. 7",
			hideOptions: "Ukryj opcje", options: "Opcje",
			showResultsIn: "Pokaż wyniki w", both: "Obu", metric: "Metryczne", us: "USA",
			bmiScale: "Skala BMI", scaleWho: "Standard WHO (nadwaga od 25)", scaleAsia: "Azjatycka (nadwaga od 23)", scaleIndia: "", scaleHint: "",
			stepNote: "Każde pole jest zsynchronizowane ze swoim odpowiednikiem. Tylko dla dorosłych od 20. roku życia; zobacz uwagi poniżej.",
			emptyPrompt: "Wpisz wagę i wzrost, aby zobaczyć swoje BMI, albo wypróbuj przykład: ",
			copyLink: "Skopiuj link do tego wyniku", saveMeasurement: "Zapisz ten pomiar", print: "Drukuj", whereScale: "Twoje miejsce na skali",
			myMeasurements: "Moje pomiary", date: "Data", noteOpt: "Notatka (opcjonalnie)", notePh: "np. po urlopie", save: "Zapisz", cancel: "Anuluj",
			chartAria: "Wykres zapisanych wartości BMI w czasie", copyCsv: "Skopiuj jako tabelę do arkusza", copyLinkAll: "Skopiuj link z moją historią",
			storeBlocked: "Przeglądarka blokuje pamięć, więc pomiary znikną po zamknięciu tej karty. Skopiuj link, aby je zachować.",
			saved: { one: "{n} pomiar zapisany w tej przeglądarce.", few: "{n} pomiary zapisane w tej przeglądarce.", many: "{n} pomiarów zapisanych w tej przeglądarce.", other: "{n} pomiarów zapisanych w tej przeglądarce." },
			copyFailed: "Nie udało się skopiować", copiedBtn: "Skopiowano ✓",
			sumResults: "Wyniki w {u} · {s}", unitsUS: "jednostkach USA", unitsMetric: "jednostkach metrycznych", unitsBoth: "obu systemach", scaleShortWho: "skala WHO", scaleShortIndia: "", scaleShortAsia: "skala azjatycka",
			examples: [["170 cm, 65 kg", "65", "170"], ["165 cm, 78 kg", "78", "165"], ["182 cm, 98 kg", "98", "182"]],
			yourBmi: "Twoje BMI", healthyWeight: "Prawidłowa waga dla Twojego wzrostu", bmiRange: "BMI od {lo} do {hi}", bmiPrime: "BMI Prime", primeSub: "Twoje BMI &divide; {hi} (1,00 lub mniej to norma)",
			ponderal: "Wskaźnik ponderalny", ponderalSub: "kg na m&sup3; (alternatywa dla osób bardzo wysokich lub bardzo niskich)",
			verdictNormal: "Masz <b>prawidłową masę ciała</b>. Świetnie! Zdrowy zakres wagi przy tym wzroście to od {lo} do {hi}.",
			verdictGain: "Twoja kategoria: <b>{catl}</b>. Aby osiągnąć prawidłową wagę, trzeba by przytyć od <b>{min}</b> do <b>{max}</b>.",
			verdictLose: "Twoja kategoria: <b>{catl}</b>. Aby osiągnąć prawidłową wagę, trzeba by schudnąć od <b>{min}</b> do <b>{max}</b>.",
			verdictSmall: "BMI to narzędzie przesiewowe, a nie diagnoza. Nie uwzględnia mięśni, budowy ciała, wieku ani pochodzenia etnicznego.",
			enterFirst: "Najpierw wpisz wagę i wzrost", pickDate: "Wybierz datę", savedOn: "Zapisano: {d}",
			thDate: "Data", thWeight: "Waga", thBmi: "BMI", thCategory: "Kategoria", thNote: "Notatka", deleteAria: "Usuń pomiar z dnia {d}",
			chartMore: "Zapisz kolejny pomiar, aby zobaczyć, jak zmienia się Twoje BMI.", entryDeleted: "Pomiar usunięty.", undo: "Cofnij",
			csvHeader: "Data\tWaga (kg)\tWzrost (cm)\tBMI\tNotatka", csvCopied: "Skopiowano: wklej do arkusza",
			linkCopied: "Link skopiowany", linkCopiedAll: "Link skopiowany: zawiera całą Twoją historię",
			loadingOld: "Wczytywanie obliczeń z udostępnionego linku…", oldFailed: "Nie udało się wczytać tego starego linku (mógł wygasnąć). Wpisz wagę i wzrost powyżej.",
			sharedLoaded: "Wczytano udostępniony wynik", openedShared: "Otwarto udostępniony wynik. Jest już zapisany w tej przeglądarce.", linkUnreadable: "Nie udało się odczytać tego linku.",
			refCategory: "Kategoria", refWho: "Standard WHO", refIndia: "", refAsian: "Azjatycka", refAndOver: "{n} i więcej",
			refClasses: "Stopnie otyłości według WHO: I stopień 30 – 34,9, II stopień 35 – 39,9, III stopień 40 i więcej.",
			dotTitle: "{d}: BMI {b}, {w}",
			cats: cats(["Wygłodzenie", "Wychudzenie", "Niedowaga", "Waga prawidłowa", "Nadwaga", "Otyłość I stopnia", "Otyłość II stopnia", "Otyłość III stopnia", "Otyłość", "Niedowaga"])
		},
		ar: {
			code: "ar", name: "العربية", path: "/hasibat-kutlat-al-jism", locale: "ar-u-nu-latn", dec: ".", langLabel: "اللغة", defScale: "who", defUnits: "m", dir: "rtl",
			meta: { title: "حاسبة كتلة الجسم", tag: "مؤشر كتلة الجسم والوزن الصحي ومتابعة التقدم.", h1: "حاسبة مؤشر كتلة الجسم (BMI)", docTitle: "حاسبة مؤشر كتلة الجسم BMI: احسب وزنك المثالي | MES", ogLocale: "ar_AR",
				desc: "حاسبة مؤشر كتلة الجسم مجانًا: أدخل وزنك بالكيلوغرام وطولك بالسنتيمتر لتعرف مؤشر كتلة جسمك وتصنيفك حسب منظمة الصحة العالمية ووزنك الصحي وكم كيلوغرامًا تحتاج أن تزيد أو تنقص." },
			mixUnits: "<b>استخدم الوحدات التي تناسبك:</b> أدخل الوزن بالكيلوغرام أو الرطل والطول بالسنتيمتر أو بالقدم والبوصة، وتمتلئ الحقول الأخرى تلقائيًا أثناء الكتابة.",
			weight: "الوزن", height: "الطول", phKg: "مثال: 70.5", phCm: "مثال: 170", phLb: "مثال: 155", phFt: "مثال: 5", phIn: "مثال: 7",
			hideOptions: "إخفاء الخيارات", options: "الخيارات",
			showResultsIn: "عرض النتائج بـ", both: "كلاهما", metric: "متري", us: "أمريكي",
			bmiScale: "مقياس المؤشر", scaleWho: "معيار منظمة الصحة العالمية (زيادة الوزن من 25)", scaleAsia: "المقياس الآسيوي (زيادة الوزن من 23)", scaleIndia: "", scaleHint: "",
			stepNote: "كل حقل يتغيّر مع نظيره. للبالغين من عمر 20 عامًا فأكثر فقط؛ راجع الملاحظات أدناه.",
			emptyPrompt: "أدخل وزنك وطولك لترى مؤشر كتلة جسمك، أو جرّب مثالًا: ",
			copyLink: "نسخ رابط هذه النتيجة", saveMeasurement: "حفظ هذا القياس", print: "طباعة", whereScale: "موقعك على المقياس",
			myMeasurements: "قياساتي", date: "التاريخ", noteOpt: "ملاحظة (اختياري)", notePh: "مثال: بعد العطلة", save: "حفظ", cancel: "إلغاء",
			chartAria: "رسم بياني لمؤشر كتلة جسمك المحفوظ عبر الزمن", copyCsv: "نسخ كجدول بيانات", copyLinkAll: "نسخ الرابط مع سجلّي",
			storeBlocked: "متصفحك يمنع التخزين، لذلك ستضيع قياساتك عند إغلاق علامة التبويب هذه. انسخ رابطًا للاحتفاظ بها.",
			saved: { zero: "لا توجد قياسات محفوظة في هذا المتصفح.", one: "قياس واحد محفوظ في هذا المتصفح.", two: "قياسان محفوظان في هذا المتصفح.", few: "{n} قياسات محفوظة في هذا المتصفح.", many: "{n} قياسًا محفوظًا في هذا المتصفح.", other: "{n} قياس محفوظ في هذا المتصفح." },
			copyFailed: "تعذّر النسخ", copiedBtn: "تم النسخ ✓",
			sumResults: "النتائج بـ{u} · {s}", unitsUS: "الوحدات الأمريكية", unitsMetric: "النظام المتري", unitsBoth: "النظامين", scaleShortWho: "مقياس منظمة الصحة العالمية", scaleShortIndia: "", scaleShortAsia: "المقياس الآسيوي",
			examples: [["170 cm, 65 kg", "65", "170"], ["160 cm, 75 kg", "75", "160"], ["180 cm, 100 kg", "100", "180"]],
			yourBmi: "مؤشر كتلة جسمك", healthyWeight: "الوزن الصحي لطولك", bmiRange: "المؤشر من {lo} إلى {hi}", bmiPrime: "BMI Prime", primeSub: "مؤشرك &divide; {hi}؛ القيمة 1.00 أو أقل ضمن المعدل الطبيعي",
			ponderal: "مؤشر بوندرال", ponderalSub: "kg لكل m&sup3; (بديل يناسب الأشخاص الطوال جدًا أو القصار جدًا)",
			verdictNormal: "وزنك <b>طبيعي</b>. أحسنت! نطاق الوزن الصحي لهذا الطول من {lo} إلى {hi}.",
			verdictGain: "تصنيفك: <b>{cat}</b>. لتصل إلى الوزن الطبيعي تحتاج إلى زيادة وزنك بمقدار يتراوح بين <b>{min}</b> و<b>{max}</b>.",
			verdictLose: "تصنيفك: <b>{cat}</b>. لتصل إلى الوزن الطبيعي تحتاج إلى إنقاص وزنك بمقدار يتراوح بين <b>{min}</b> و<b>{max}</b>.",
			verdictSmall: "مؤشر كتلة الجسم أداة فحص أولي وليس تشخيصًا، ولا يأخذ في الحسبان العضلات أو بنية الجسم أو العمر أو الأصل العرقي.",
			enterFirst: "أدخل وزنك وطولك أولًا", pickDate: "اختر تاريخًا", savedOn: "تم الحفظ: {d}",
			thDate: "التاريخ", thWeight: "الوزن", thBmi: "المؤشر", thCategory: "التصنيف", thNote: "ملاحظة", deleteAria: "حذف قياس {d}",
			chartMore: "احفظ قياسًا آخر لترى تغيّر مؤشرك مع الوقت.", entryDeleted: "تم حذف القياس.", undo: "تراجع",
			csvHeader: "التاريخ\tالوزن (kg)\tالطول (cm)\tالمؤشر\tملاحظة", csvCopied: "تم النسخ: الصقه في جدول بيانات",
			linkCopied: "تم نسخ الرابط", linkCopiedAll: "تم نسخ الرابط: يحتوي على سجلّك كاملًا",
			loadingOld: "جارٍ تحميل الحساب من الرابط…", oldFailed: "تعذّر تحميل ذلك الرابط القديم (ربما انتهت صلاحيته). أدخل وزنك وطولك في الأعلى.",
			sharedLoaded: "تم تحميل النتيجة المشتركة", openedShared: "فتحت نتيجة مشتركة، وهي محفوظة الآن في هذا المتصفح.", linkUnreadable: "تعذّرت قراءة ذلك الرابط.",
			refCategory: "التصنيف", refWho: "معيار منظمة الصحة العالمية", refIndia: "", refAsian: "آسيوي", refAndOver: "{n} فأكثر",
			refClasses: "درجات السمنة حسب منظمة الصحة العالمية: الدرجة الأولى 30 – 34.9، الثانية 35 – 39.9، الثالثة 40 فأكثر.",
			dotTitle: "{d}: المؤشر {b}، {w}",
			cats: cats(["نحافة شديدة", "نحافة متوسطة", "نحافة خفيفة", "وزن طبيعي", "زيادة في الوزن", "سمنة من الدرجة الأولى", "سمنة من الدرجة الثانية", "سمنة من الدرجة الثالثة", "سمنة", "نقص الوزن"])
		},
		hi: {
			code: "hi", name: "हिन्दी", path: "/bmi-calculator-hindi", locale: "hi-IN", dec: ".", langLabel: "भाषा", defScale: "india", defUnits: "m", dir: "ltr",
			meta: { title: "बीएमआई कैलकुलेटर", tag: "बॉडी मास इंडेक्स, सही वज़न और आपकी प्रगति।", h1: "बीएमआई कैलकुलेटर (बॉडी मास इंडेक्स)", docTitle: "BMI कैलकुलेटर हिंदी में: अपना बॉडी मास इंडेक्स जानें | MES", ogLocale: "hi_IN",
				desc: "मुफ़्त बीएमआई कैलकुलेटर: अपना वज़न और लंबाई डालें और जानें अपना बॉडी मास इंडेक्स, एशियाई या WHO मानक के अनुसार श्रेणी, आपकी लंबाई के लिए सही वज़न और कितना वज़न घटाना या बढ़ाना है।" },
			mixUnits: "<b>वज़न किलो या पाउंड में और लंबाई सेंटीमीटर या फ़ुट-इंच में लिखें,</b> जो भी आसान हो: लिखते ही बाकी खाने अपने-आप भर जाते हैं।",
			weight: "वज़न", height: "लंबाई", phKg: "जैसे 65.5", phCm: "जैसे 165", phLb: "जैसे 144", phFt: "जैसे 5", phIn: "जैसे 5",
			hideOptions: "विकल्प छिपाएँ", options: "विकल्प",
			showResultsIn: "नतीजे दिखाएँ", both: "दोनों", metric: "मीट्रिक", us: "अमेरिकी",
			bmiScale: "बीएमआई मानक", scaleWho: "WHO मानक (25 से ज़्यादा वज़न)", scaleAsia: "एशियाई मानक (23 से ज़्यादा वज़न)", scaleIndia: "भारतीय दिशानिर्देश 2009 (23 से ज़्यादा वज़न, 25 से मोटापा)",
			scaleHint: "भारत में डॉक्टर 2009 का भारतीय दिशानिर्देश इस्तेमाल करते हैं: 18 से 22.9 सामान्य, 23 से 24.9 ज़्यादा वज़न और 25 से मोटापा। इसलिए यहाँ यही मानक पहले से चुना गया है; ऊपर WHO या एशियाई मानक भी चुन सकते हैं।",
			stepNote: "हर खाना अपने जोड़ीदार खाने के साथ बदलता है। केवल 20 साल या उससे ज़्यादा उम्र के वयस्कों के लिए; नीचे की बातें ज़रूर पढ़ें।",
			emptyPrompt: "अपना बीएमआई देखने के लिए वज़न और लंबाई डालें, या कोई उदाहरण आज़माएँ: ",
			copyLink: "इस नतीजे का लिंक कॉपी करें", saveMeasurement: "यह माप सेव करें", print: "प्रिंट करें", whereScale: "पैमाने पर आप कहाँ हैं",
			myMeasurements: "मेरे माप", date: "तारीख़", noteOpt: "नोट (वैकल्पिक)", notePh: "जैसे छुट्टियों के बाद", save: "सेव करें", cancel: "रद्द करें",
			chartAria: "समय के साथ आपके सेव किए गए बीएमआई का चार्ट", copyCsv: "स्प्रेडशीट टेबल के रूप में कॉपी करें", copyLinkAll: "मेरे इतिहास के साथ लिंक कॉपी करें",
			storeBlocked: "आपका ब्राउज़र स्टोरेज रोक रहा है, इसलिए यह टैब बंद करते ही आपके माप मिट जाएँगे। उन्हें रखने के लिए लिंक कॉपी कर लें।",
			saved: { one: "इस ब्राउज़र में {n} माप सेव है।", other: "इस ब्राउज़र में {n} माप सेव हैं।" },
			copyFailed: "कॉपी नहीं हो सका", copiedBtn: "कॉपी हो गया ✓",
			sumResults: "नतीजे {u} में · {s}", unitsUS: "अमेरिकी इकाइयों", unitsMetric: "मीट्रिक इकाइयों", unitsBoth: "दोनों इकाइयों", scaleShortWho: "WHO मानक", scaleShortIndia: "भारतीय मानक", scaleShortAsia: "एशियाई मानक",
			examples: [["5 फ़ुट 6 इंच, 70 kg", "70", "167.64"], ["160 cm, 55 kg", "55", "160"], ["5 फ़ुट 2 इंच, 68 kg", "68", "157.48"]],
			yourBmi: "आपका बीएमआई", healthyWeight: "आपकी लंबाई के लिए सही वज़न", bmiRange: "बीएमआई {lo} से {hi}", bmiPrime: "BMI Prime", primeSub: "आपका बीएमआई &divide; {hi} (1.00 या कम सामान्य है)",
			ponderal: "पॉन्डरल इंडेक्स", ponderalSub: "kg प्रति m&sup3; (बहुत लंबे या बहुत छोटे क़द वालों के लिए एक विकल्प)",
			verdictNormal: "आपका वज़न <b>सामान्य</b> है। बहुत बढ़िया! इस लंबाई के लिए सही वज़न {lo} से {hi} तक है।",
			verdictGain: "आपकी श्रेणी: <b>{cat}</b>। सामान्य वज़न तक पहुँचने के लिए आपको <b>{min}</b> से <b>{max}</b> तक वज़न बढ़ाना होगा।",
			verdictLose: "आपकी श्रेणी: <b>{cat}</b>। सामान्य वज़न तक पहुँचने के लिए आपको <b>{min}</b> से <b>{max}</b> तक वज़न घटाना होगा।",
			verdictSmall: "बीएमआई शुरुआती जाँच का एक पैमाना है, बीमारी का निदान नहीं। यह मांसपेशियों, शरीर की बनावट, उम्र या नस्ल को नहीं देखता।",
			enterFirst: "पहले अपना वज़न और लंबाई डालें", pickDate: "कोई तारीख़ चुनें", savedOn: "सेव हुआ: {d}",
			thDate: "तारीख़", thWeight: "वज़न", thBmi: "बीएमआई", thCategory: "श्रेणी", thNote: "नोट", deleteAria: "{d} का माप हटाएँ",
			chartMore: "समय के साथ अपना बीएमआई देखने के लिए एक और माप सेव करें।", entryDeleted: "माप हटा दिया गया।", undo: "वापस लाएँ",
			csvHeader: "तारीख़\tवज़न (kg)\tलंबाई (cm)\tबीएमआई\tनोट", csvCopied: "कॉपी हो गया: इसे स्प्रेडशीट में पेस्ट करें",
			linkCopied: "लिंक कॉपी हो गया", linkCopiedAll: "लिंक कॉपी हो गया: इसमें आपका पूरा इतिहास है",
			loadingOld: "शेयर किए गए लिंक से हिसाब लोड हो रहा है…", oldFailed: "वह पुराना लिंक लोड नहीं हो सका (शायद उसकी अवधि ख़त्म हो गई)। ऊपर अपना वज़न और लंबाई डालें।",
			sharedLoaded: "शेयर किया गया नतीजा लोड हो गया", openedShared: "आपने शेयर किया गया एक नतीजा खोला है। अब यह इस ब्राउज़र में सेव है।", linkUnreadable: "वह लिंक पढ़ा नहीं जा सका।",
			refCategory: "श्रेणी", refWho: "WHO मानक", refIndia: "भारतीय दिशानिर्देश (2009)", refAsian: "एशियाई", refAndOver: "{n} या उससे ज़्यादा",
			refClasses: "WHO के अनुसार मोटापे की श्रेणियाँ: श्रेणी I 30 – 34.9, श्रेणी II 35 – 39.9, श्रेणी III 40 या उससे ज़्यादा।",
			dotTitle: "{d}: बीएमआई {b}, {w}",
			cats: cats(["गंभीर दुबलापन", "मध्यम दुबलापन", "हल्का दुबलापन", "सामान्य वज़न", "ज़्यादा वज़न", "मोटापा (श्रेणी I)", "मोटापा (श्रेणी II)", "मोटापा (श्रेणी III)", "मोटापा", "कम वज़न"])
		}
	};
	var out = { langs: Object.keys(I18N), table: I18N, CATS_EN: CATS_EN };
	if (typeof module !== "undefined" && module.exports) module.exports = out; else root.BM_I18N = out;
})(typeof window !== "undefined" ? window : globalThis);

/* MES BMI Calculator 2.0 -- mes.fm/bmicalculator (UI; maths + share encoding in lib.js, global BM).
 * Weight / height are kept in kg / cm; localStorage "mes-bmicalculator:v1" = { kg, cm, units, scale, history }.
 * Strings: i18n.js (global BM_I18N), one entry per language; translated pages (data-lang != "en") also keep { units, scale, options } in "mes-bmicalculator:v1:<lang>".
 * Links: ?kg=&cm= (or ?lb=&ft=&in=) for one result, ?s=<encoded> with the history; old /bmicalculator/s/<id> links resolve via /api/share?calc=bmi.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("bm");
	if (!root || !window.BM) return;
	var KEY = "mes-bmicalculator:v1", memOnly = false;
	/* ---------- language (i18n.js, global BM_I18N): the page's <div id="bm" data-lang=".."> picks the strings, number format and defaults ---------- */
	var I = window.BM_I18N, LANG = root.getAttribute("data-lang") || "en", EN = I.table.en, T = I.table[LANG] || EN, LOC = T.locale, EN_PAGE = LANG === "en";
	var PKEY = KEY + ":" + LANG;      // translated pages keep their own units / scale / options choice; the measurements (KEY) are shared with every language
	var HAS_INDIA = !!t("scaleIndia");     // the India (2009 guideline) scale is offered on the English and Hindi pages only
	function okScale(s) { return s === "asia" || (s === "india" && HAS_INDIA) ? s : s === "who" ? "who" : null; }
	var PATH = T.path, RTL = T.dir === "rtl", COMMA = T.dec === ",", PL = window.Intl && Intl.PluralRules ? new Intl.PluralRules(LOC) : null;
	function t(k, v) { var s = T[k] != null ? T[k] : EN[k]; return v ? String(s).replace(/\{(\w+)\}/g, function (m, x) { return v[x] != null ? v[x] : m; }) : s; }
	function plural(k, n) { var o = T[k] || EN[k], f = PL ? PL.select(n) : (n === 1 ? "one" : "other"); return (o[f] || o.other).replace("{n}", n); }
	function nf(n, lo, hi) { return new Intl.NumberFormat(LOC, { minimumFractionDigits: lo, maximumFractionDigits: hi, useGrouping: false }).format(n); }
	function fx(n, d) { return EN_PAGE ? BM.fix(n, d) : (n == null || !isFinite(n) ? "" : nf(Math.round(n * Math.pow(10, d)) / Math.pow(10, d), d, d)); }   // fixed decimals
	function tr(n, d) { return EN_PAGE ? BM.trim(n, d) : (n == null || !isFinite(n) ? "" : nf(Math.round(n * Math.pow(10, d)) / Math.pow(10, d), 0, d)); }   // up to d decimals
	function pn(v) { return EN_PAGE ? BM.num(v) : BM.numLoc(v, COMMA); }      // typed numbers: "68,5" and "68.5" both work on a decimal-comma page
	function dt(d) { if (EN_PAGE) return d; var x = new Date(d + "T00:00:00"); return isNaN(x) ? d : x.toLocaleDateString(LOC); }
	function catName(c) { return (T.cats && T.cats[c]) || c; }
	function lowerFirst(s) { return s.charAt(0).toLocaleLowerCase(LOC) + s.slice(1); }
	var EXAMPLES = (T.examples || EN.examples).map(function (x) { return [x[0], { kg: x[1], cm: x[2] }]; });
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	var st = { kg: "", cm: "", units: T.defUnits || "b", scale: T.defScale || "who", oh: false, history: [] };
	function load() {
		if (!EN_PAGE) return loadShared();
		try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) { st.kg = String(s.kg || ""); st.cm = String(s.cm || ""); st.units = s.ru === "m" || s.ru === "i" ? s.ru : "b"; st.scale = okScale(s.scale) || "who"; st.oh = s.oh === true; st.history = (Array.isArray(s.history) ? s.history : []).map(BM.cleanEntry).filter(Boolean); } } catch (e) { memOnly = true; }
	}
	// translated pages: weight, height and the measurements live in the English page's object (so every language shares them); units / scale / options in PKEY
	function loadShared() {
		try {
			var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) { st.kg = String(s.kg || ""); st.cm = String(s.cm || ""); st.history = (Array.isArray(s.history) ? s.history : []).map(BM.cleanEntry).filter(Boolean); }
			var p = JSON.parse(localStorage.getItem(PKEY) || "null"); if (p) { st.units = p.ru === "b" || p.ru === "i" || p.ru === "m" ? p.ru : st.units; st.scale = okScale(p.scale) || st.scale; st.oh = p.oh === true; }
		} catch (e) { memOnly = true; }
	}
	function save() {
		try {
			if (EN_PAGE) localStorage.setItem(KEY, JSON.stringify(Object.assign({ ru: st.units }, st)));
			else {
				var s = {}; try { s = JSON.parse(localStorage.getItem(KEY) || "null") || {}; } catch (x) { s = {}; }
				s.kg = st.kg; s.cm = st.cm; s.history = st.history; localStorage.setItem(KEY, JSON.stringify(s));
				localStorage.setItem(PKEY, JSON.stringify({ ru: st.units, scale: st.scale, oh: st.oh }));
			}
			memOnly = false;
		} catch (e) { memOnly = true; }
		$("bm-store-note").textContent = memOnly ? t("storeBlocked") : plural("saved", st.history.length);
	}
	function toast(msg) {
		var t = $("bm-toast"); if (!t) { t = document.createElement("div"); t.id = "bm-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700);
	}
	function flash(btn) {
		if (!btn) return; if (btn._o == null) btn._o = btn.textContent; btn.textContent = t("copiedBtn"); btn.classList.add("bm-copied");
		clearTimeout(btn._t); btn._t = setTimeout(function () { btn.textContent = btn._o; btn._o = null; btn.classList.remove("bm-copied"); }, 1600);
	}
	function copy(text, msg, btn) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); flash(btn); } catch (e) { toast(t("copyFailed")); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); flash(btn); }, fb); else fb();
	}
	function notice(h) { var n = $("bm-notice"); n.innerHTML = h || ""; n.hidden = !h; }

	/* ---------- inputs: kg / cm are the truth, the other unit system mirrors them ---------- */
	function fillOthers(except) {
		var kg = BM.num(st.kg), cm = BM.num(st.cm);
		if (except !== "m") { $("bm-kg").value = kg > 0 ? tr(kg, 2) : ""; $("bm-cm").value = cm > 0 ? tr(cm, 1) : ""; }
		if (except !== "i") {
			$("bm-lb").value = kg > 0 ? tr(BM.kgToLb(kg), 1) : "";
			if (cm > 0) { var f = BM.cmToFtIn(cm); $("bm-ft").value = String(f.ft); $("bm-in").value = tr(f.inch, 1); } else { $("bm-ft").value = ""; $("bm-in").value = ""; }
		}
	}
	function fromMetric() { var kg = pn($("bm-kg").value), cm = pn($("bm-cm").value); st.kg = kg > 0 ? String(kg) : ""; st.cm = cm > 0 ? String(cm) : ""; fillOthers("m"); }
	function fromImperial() {
		var lb = pn($("bm-lb").value), ft = pn($("bm-ft").value), inch = pn($("bm-in").value);
		st.kg = lb > 0 ? String(Math.round(BM.lbToKg(lb) * 1000) / 1000) : "";
		st.cm = (ft > 0 || inch > 0) && (ft || 0) * 12 + (inch || 0) > 0 ? String(Math.round(BM.ftInToCm(ft, inch) * 100) / 100) : "";
		fillOthers("i");
	}
	["bm-kg", "bm-cm"].forEach(function (id) { $(id).addEventListener("input", function () { fromMetric(); save(); update(); }); });
	["bm-lb", "bm-ft", "bm-in"].forEach(function (id) { $(id).addEventListener("input", function () { fromImperial(); save(); update(); }); });
	$("bm-units").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.units = b.dataset.u; save(); showUnits(); showOpts(); update(); });
	$("bm-scale").addEventListener("change", function () { st.scale = this.value; save(); showOpts(); update(); });
	function showOpts() {
		var h = st.oh, sum = $("bm-optsum");
		$("bm-opts").hidden = h; sum.hidden = !h;
		sum.textContent = t("sumResults", { u: t(st.units === "i" ? "unitsUS" : st.units === "m" ? "unitsMetric" : "unitsBoth"), s: t(st.scale === "asia" ? "scaleShortAsia" : st.scale === "india" ? "scaleShortIndia" : "scaleShortWho") });
		$("bm-opttoggle").textContent = h ? t("options") : t("hideOptions"); $("bm-opttoggle").setAttribute("aria-expanded", String(!h));
	}
	$("bm-opttoggle").addEventListener("click", function () { st.oh = !st.oh; save(); showOpts(); });
	function showUnits() {
		[].forEach.call($("bm-units").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.u === st.units)); });
	}

	$("bm-examples").innerHTML = EXAMPLES.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("bm-examples").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var x = EXAMPLES[+b.dataset.i][1]; st.kg = x.kg; st.cm = x.cm; fillOthers(); save(); update(); });

	/* ---------- result ---------- */
	function wt(kg) { var lb = tr(BM.kgToLb(kg), 1) + " lb", k = tr(kg, 1) + " kg", w = st.units === "i" ? lb : st.units === "m" ? k : lb + " (" + k + ")"; return RTL ? "\u2066" + w + "\u2069" : w; }   // RTL pages: isolate "53.5 kg" so the bidi algorithm keeps number and unit together
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + s + "</div></div>"; }
	var cur = null;
	var GAUGE = { min: 14, max: 42 };
	var BANDS = { who: [18.5, 25, 30], asia: [18.5, 23, 27.5], india: [18, 23, 25] };      // where under / normal / over / obese start, per scale
	function bandColors(scale) { var c = BANDS[scale] || BANDS.who; return [[c[0], "under"], [c[1], "normal"], [c[2], "over"], [GAUGE.max, "obese"]]; }
	function update() {
		var kg = BM.num(st.kg), cm = BM.num(st.cm), b = BM.bmi(kg, cm);
		cur = b == null ? null : { kg: kg, cm: cm, bmi: b };
		$("bm-empty").hidden = b != null; $("bm-out").hidden = b == null;
		renderHistory();
		if (b == null) return;
		var S = st.scale, cat = BM.category(b, S), R = BM.healthyRange(cm, S), N = BM.toNormal(kg, cm, S), r1 = Math.round(b * 10) / 10;
		var cls = cat.group === "normal" ? "tu-stat--hero" : "";
		var cn = catName(cat.name);
		$("bm-hero").innerHTML = stat(t("yourBmi"), fx(b, 1), esc(cn), cls || "tu-stat--hero") +
			stat(t("healthyWeight"), wt(R.lo) + " &ndash; " + wt(R.hi), t("bmiRange", { lo: tr(R.loBmi, 1), hi: tr(R.hiBmi, 1) })) +
			stat(t("bmiPrime"), fx(BM.prime(b, S), 2), t("primeSub", { hi: tr(BM.SCALES[S].hi, 1) })) +
			stat(t("ponderal"), fx(BM.ponderal(kg, cm), 1), t("ponderalSub"));
		var v, vv = { cat: esc(cn), catl: esc(lowerFirst(cn)), min: wt(N.min), max: wt(N.max), lo: wt(R.lo), hi: wt(R.hi) };
		v = t(N.dir === "none" ? "verdictNormal" : N.dir === "gain" ? "verdictGain" : "verdictLose", vv);
		$("bm-verdict").innerHTML = v + '<br><small class="bm-small">' + t("verdictSmall") + "</small>";
		$("bm-verdict").className = "tu-card bm-verdict is-" + cat.group;
		// gauge
		var bands = bandColors(S), prev = GAUGE.min, h = '<div class="bm-bar">';
		bands.forEach(function (x) { h += '<span class="bm-band bm-band--' + x[1] + '" style="width:' + ((x[0] - prev) / (GAUGE.max - GAUGE.min) * 100) + '%"></span>'; prev = x[0]; });
		var pos = Math.max(0, Math.min(100, (b - GAUGE.min) / (GAUGE.max - GAUGE.min) * 100));
		h += '</div><div class="bm-pin" style="left:' + pos + '%"><span>' + fx(b, 1) + '</span></div><div class="bm-ticks">';
		bands.slice(0, -1).forEach(function (x) { h += '<span style="left:' + ((x[0] - GAUGE.min) / (GAUGE.max - GAUGE.min) * 100) + '%">' + tr(x[0], 1) + "</span>"; });
		$("bm-gauge").innerHTML = h + "</div>";
		var cats = BM.SCALES[S].cuts, lo = 0, items = "";
		cats.forEach(function (c, i) { var from = i === 0 ? null : cats[i - 1][0], to = c[0]; items += '<li class="bm-cat bm-cat--' + c[2] + (i === cat.index ? " is-on" : "") + '"><span>' + esc(catName(c[1])) + "</span><span>" + (from == null ? "&lt; " + tr(to, 1) : to === Infinity ? "&ge; " + tr(from, 1) : tr(from, 1) + " &ndash; " + tr(Math.round((to - 0.1) * 10) / 10, 1)) + "</span></li>"; });
		$("bm-cats").innerHTML = items;
		drawChart();
	}
	// weight-for-height chart: the classic BMI chart with your own point on it (BM.chartSvg in lib.js)
	function chartLabels() { return { weight: t("weight"), height: t("height"), you: t("yourBmi"), under: esc(catName("Underweight")), normal: esc(catName("Normal weight")), over: esc(catName("Overweight")), obese: esc(catName("Obese")) }; }
	function drawChart() {
		var box = $("bm-chart"); if (!box || !cur) return;
		var narrow = box.clientWidth && box.clientWidth < 480;
		box.innerHTML = BM.chartSvg({ kg: cur.kg, cm: cur.cm, scale: st.scale, imperial: st.units === "i", w: 640, h: narrow ? 520 : 400, labels: chartLabels(), fmt: fx }) +
			(EN_PAGE ? '<p class="bm-chartlink">&#128200; <a href="/bmicalculator/bmi-chart?kg=' + BM.trim(cur.kg, 2) + "&cm=" + BM.trim(cur.cm, 1) + '">Open the full BMI chart with your point on it &rarr;</a></p>' : "");
	}
	if (window.ResizeObserver && $("bm-chart")) { var chW = 0; new ResizeObserver(function () { var w = $("bm-chart").clientWidth; if ((w < 480) !== (chW < 480)) { chW = w; drawChart(); } chW = w; }).observe($("bm-chart")); }

	/* ---------- history ---------- */
	function today() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
	$("bm-save").onclick = function () { $("bm-hist-card").hidden = false; $("bm-addrow").hidden = false; $("bm-date").value = today(); $("bm-note").value = ""; $("bm-hist-card").scrollIntoView({ behavior: "smooth", block: "center" }); $("bm-note").focus(); };
	$("bm-addcancel").onclick = function () { $("bm-addrow").hidden = true; renderHistory(); };
	$("bm-add").onclick = function () {
		if (!cur) { toast(t("enterFirst")); return; }
		var e = BM.cleanEntry({ d: $("bm-date").value, kg: cur.kg, cm: cur.cm, n: $("bm-note").value });
		if (!e) { toast(t("pickDate")); return; }
		st.history = st.history.filter(function (x) { return !(x.d === e.d && x.n === e.n); }); st.history.push(e); st.history = BM.sortEntries(st.history);
		$("bm-addrow").hidden = true; save(); renderHistory(); toast(t("savedOn", { d: dt(e.d) }));
	};
	function renderHistory() {
		var card = $("bm-hist-card"), list = BM.sortEntries(st.history);
		card.hidden = !list.length && $("bm-addrow").hidden; if (card.hidden) return;
		var rows = list.slice().reverse().map(function (e, i) {
			var b = BM.bmi(e.kg, e.cm), c = BM.category(b, st.scale);
			return '<tr><td>' + esc(dt(e.d)) + "</td><td>" + wt(e.kg) + "</td><td>" + fx(b, 1) + "</td><td>" + esc(catName(c.name)) + "</td><td>" + esc(e.n) + '</td><td><button type="button" class="bm-del" data-d="' + esc(e.d) + '" data-n="' + esc(e.n) + '" aria-label="' + esc(t("deleteAria", { d: dt(e.d) })) + '">✕</button></td></tr>';
		}).join("");
		$("bm-table").innerHTML = list.length ? "<thead><tr><th>" + t("thDate") + "</th><th>" + t("thWeight") + "</th><th>" + t("thBmi") + "</th><th>" + t("thCategory") + "</th><th>" + t("thNote") + "</th><th></th></tr></thead><tbody>" + rows + "</tbody>" : "";
		$("bm-chart").innerHTML = list.length > 1 ? chart(list) : (list.length ? '<p class="tu-note">' + t("chartMore") + "</p>" : "");
		$("bm-csv").disabled = $("bm-link-all").disabled = !list.length;
	}
	$("bm-table").addEventListener("click", function (e) {
		var b = e.target.closest(".bm-del"); if (!b) return;
		var snap = st.history.slice(); st.history = st.history.filter(function (x) { return !(x.d === b.dataset.d && (x.n || "") === b.dataset.n); }); save(); renderHistory();
		notice(t("entryDeleted") + ' <button type="button" class="tu-chip" id="bm-undo">' + t("undo") + "</button>"); $("bm-undo").onclick = function () { st.history = snap; save(); renderHistory(); notice(""); };
	});
	function chart(list) {
		var W = 640, H = 240, L = 40, R = 14, T = 12, B = 30, bm = list.map(function (e) { return BM.bmi(e.kg, e.cm); });
		var lo = Math.min(15, Math.floor(Math.min.apply(null, bm)) - 1), hi = Math.max(32, Math.ceil(Math.max.apply(null, bm)) + 1);
		var t0 = Date.parse(list[0].d), t1 = Date.parse(list[list.length - 1].d) || t0 + 1; if (t1 === t0) t1 = t0 + 864e5;
		var X = function (d) { return L + (Date.parse(d) - t0) / (t1 - t0) * (W - L - R); }, Y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };
		var cuts = BANDS[st.scale] || BANDS.who, cls = ["under", "normal", "over", "obese"], edges = [lo].concat(cuts.filter(function (c) { return c > lo && c < hi; }), [hi]), s = "";
		var allCuts = [lo].concat(cuts, [hi]);
		for (var i = 0; i < 4; i++) { var a = Math.max(lo, allCuts[i]), z = Math.min(hi, allCuts[i + 1]); if (z > a) s += '<rect class="bm-cb bm-cb--' + cls[i] + '" x="' + L + '" y="' + Y(z) + '" width="' + (W - L - R) + '" height="' + (Y(a) - Y(z)) + '"/>'; }
		for (var g = Math.ceil(lo / 5) * 5; g <= hi; g += 5) s += '<text class="bm-ct" x="' + (L - 6) + '" y="' + (Y(g) + 4) + '" text-anchor="end">' + g + '</text><line class="bm-gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(g) + '" y2="' + Y(g) + '"/>';
		var pts = list.map(function (e, i) { return X(e.d) + "," + Y(bm[i]); });
		s += '<polyline class="bm-line" points="' + pts.join(" ") + '"/>';
		list.forEach(function (e, i) { s += '<circle class="bm-dot" cx="' + X(e.d) + '" cy="' + Y(bm[i]) + '" r="4"><title>' + esc(t("dotTitle", { d: dt(e.d), b: fx(bm[i], 1), w: wt(e.kg) })) + '</title></circle>'; });
		s += '<text class="bm-ct" x="' + L + '" y="' + (H - 8) + '">' + esc(dt(list[0].d)) + '</text><text class="bm-ct" x="' + (W - R) + '" y="' + (H - 8) + '" text-anchor="end">' + esc(dt(list[list.length - 1].d)) + "</text>";
		return '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid meet" role="presentation">' + s + "</svg>";
	}
	$("bm-csv").onclick = function () { var l = [t("csvHeader")]; BM.sortEntries(st.history).forEach(function (e) { l.push([e.d, tr(e.kg, 2), tr(e.cm, 1), fx(BM.bmi(e.kg, e.cm), 1), e.n].join("\t")); }); copy(l.join("\n"), t("csvCopied")); };

	/* ---------- links ---------- */
	function shareUrl(withHistory) { return location.origin + PATH + "?" + (withHistory ? "s=" + BM.encode(st) : "kg=" + encodeURIComponent(BM.trim(BM.num(st.kg), 2)) + "&cm=" + encodeURIComponent(BM.trim(BM.num(st.cm), 1)) + (st.scale !== "who" ? "&scale=" + st.scale : "")); }
	$("bm-link").onclick = function () { copy(shareUrl(false), t("linkCopied"), this); };
	$("bm-link-top").onclick = function () { copy(shareUrl(false), t("linkCopied"), this); };
	$("bm-link-all").onclick = function () { copy(shareUrl(true), t("linkCopiedAll"), this); };
	document.querySelector("#bm .bm-print").onclick = function () { window.print(); };

	function loadOld(id) {
		notice(t("loadingOld"));
		var f = window.fetch ? window.fetch("/api/share?calc=bmi&id=" + encodeURIComponent(id)).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); }) : Promise.reject(new Error("no fetch"));
		return f.then(function (d) { var o = BM.fromOldShare(d); if (!o) throw new Error("bad"); st.kg = o.kg; st.cm = o.cm; fillOthers(); save(); update(); notice(""); history.replaceState(null, "", "/bmicalculator"); toast(t("sharedLoaded")); })
			.catch(function () { notice(t("oldFailed")); });
	}

	/* ---------- init ---------- */
	load();
	var q = new URLSearchParams(location.search), m = location.pathname.match(/^\/bmicalculator\/s\/([A-Za-z0-9]+)\/?$/);
	if (q.get("s")) { var d = BM.decode(q.get("s")); if (d) { st.kg = d.kg; st.cm = d.cm; st.scale = okScale(d.scale) || "who"; var have = {}; st.history.forEach(function (e) { have[e.d + "|" + e.n + "|" + e.kg] = 1; }); d.history.forEach(function (e) { if (!have[e.d + "|" + e.n + "|" + e.kg]) st.history.push(e); }); st.history = BM.sortEntries(st.history); notice(t("openedShared")); } else notice(t("linkUnreadable")); history.replaceState(null, "", location.pathname); }
	else if (q.get("kg") || q.get("cm") || q.get("lb") || q.get("ft") || q.get("in")) {
		if (q.get("kg") || q.get("cm")) { st.kg = String(BM.num(q.get("kg")) || ""); st.cm = String(BM.num(q.get("cm")) || ""); }
		else { var lb = BM.num(q.get("lb")), ft = BM.num(q.get("ft")), inch = BM.num(q.get("in")); st.kg = lb > 0 ? String(Math.round(BM.lbToKg(lb) * 1000) / 1000) : ""; st.cm = ((ft || 0) * 12 + (inch || 0)) > 0 ? String(Math.round(BM.ftInToCm(ft, inch) * 100) / 100) : ""; }
		if (okScale(q.get("scale"))) st.scale = okScale(q.get("scale")); history.replaceState(null, "", location.pathname);
	}
	$("bm-scale").value = st.scale; showUnits(); showOpts(); fillOthers(); save(); update();
	if (m && !q.get("s")) loadOld(m[1]);
	// the reference table
	(function () { var ref = $("bm-ref"); if (!ref) return;
		var rg = function (a, b) { return tr(a, 1) + " &ndash; " + tr(b, 1); }, ov = function (n) { return t("refAndOver", { n: tr(n, 1) }); };
		var h = "<thead><tr><th>" + t("refCategory") + "</th><th>" + t("refWho") + "</th><th>" + t("refAsian") + "</th></tr></thead><tbody>"; [["Severe thinness", "&lt; 16", "&lt; 16"], ["Moderate thinness", rg(16, 16.9), rg(16, 16.9)], ["Mild thinness", rg(17, 18.4), rg(17, 18.4)], ["Normal weight", rg(18.5, 24.9), rg(18.5, 22.9)], ["Overweight", rg(25, 29.9), rg(23, 27.4)], ["Obese", ov(30), ov(27.5)]].forEach(function (r) { h += "<tr><td>" + esc(catName(r[0])) + "</td><td>" + r[1] + "</td><td>" + r[2] + "</td></tr>"; }); ref.innerHTML = h + "</tbody>"; var nt = document.createElement("p"); nt.className = "tu-note"; nt.textContent = t("refClasses"); ref.parentNode.insertAdjacentElement("afterend", nt);
		if (HAS_INDIA) {      // the India guideline has its own bands (one underweight band, obese from 25), so it gets its own small table
			var w = document.createElement("div"), ih = "<caption>" + t("refIndia") + "</caption><thead><tr><th>" + t("refCategory") + "</th><th>BMI</th></tr></thead><tbody>";
			[["Underweight", "&lt; " + tr(18, 1)], ["Normal weight", rg(18, 22.9)], ["Overweight", rg(23, 24.9)], ["Obese", ov(25)]].forEach(function (r) { ih += "<tr><td>" + esc(catName(r[0])) + "</td><td>" + r[1] + "</td></tr>"; });
			w.className = "tu-table-wrap"; w.innerHTML = '<table class="tu-table bm-ref-india" id="bm-ref-india">' + ih + "</tbody></table>"; nt.insertAdjacentElement("afterend", w);
		}
	})();
	window.addEventListener("storage", function (e) { if ((e.key !== KEY && e.key !== PKEY) || (document.activeElement && root.contains(document.activeElement) && /INPUT|SELECT/.test(document.activeElement.tagName))) return; try { var s = JSON.parse(e.newValue); if (s) { load(); $("bm-scale").value = st.scale; showUnits(); showOpts(); fillOthers(); update(); } } catch (x) {} });
})();
