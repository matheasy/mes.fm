// node tool_apps_src/bmi-tests.js
const BM = require("./bmicalculator/lib.js");
let f = 0, n = 0; function eq(a, b, m) { n++; const ok = typeof b === "number" ? Math.abs(a - b) < 1e-6 : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), JSON.stringify(b)); } }
eq(BM.num("65,8"), 65.8, "decimal comma"); eq(BM.num("1,200"), 1200, "thousands"); eq(BM.num("x"), null, "bad"); eq(BM.num("-3"), null, "negative");
// conversions
eq(BM.lbToKg(145.1), 145.1 * 0.45359237, "lb->kg"); eq(BM.ftInToCm(6, 0), 182.88, "6ft"); eq(BM.cmToFtIn(182.88), { ft: 6, inch: 0 }, "cm->ft"); eq(BM.cmToFtIn(182.8).ft, 5, "5ft11.9"); eq(Math.round(BM.cmToFtIn(182.8).inch * 100) / 100, 11.97, "inches");
eq(BM.cmToFtIn(182.879), { ft: 6, inch: 0 }, "carry 12 in");
// the old calculator: 145.1 lb at 6 ft 0 in -> 703.06957964 * 145.1 / 72^2 = 19.68
eq(Math.round(BM.bmi(BM.lbToKg(145.1), BM.ftInToCm(6, 0)) * 10) / 10, 19.7, "old example");
eq(BM.bmi(65.8, 182.9), 65.8 / (1.829 * 1.829), "metric"); eq(BM.bmi(0, 180), null, "zero weight"); eq(BM.bmi(70, 0), null, "zero height");
// categories (rounded to 1 decimal first)
eq(BM.category(18.4, "who").name, "Mild thinness", "mild"); eq(BM.category(18.45, "who").name, "Normal weight", "18.45 rounds to 18.5"); eq(BM.category(24.9, "who").group, "normal", "24.9"); eq(BM.category(24.95, "who").group, "over", "24.95 -> 25.0");
eq(BM.category(29.9, "who").group, "over", "29.9"); eq(BM.category(30, "who").name, "Obese (class I)", "30"); eq(BM.category(41, "who").name, "Obese (class III)", "41"); eq(BM.category(15, "who").name, "Severe thinness", "15");
eq(BM.category(23.0, "asia").group, "over", "asia 23"); eq(BM.category(22.9, "asia").group, "normal", "asia 22.9"); eq(BM.category(27.5, "asia").group, "obese", "asia 27.5");
// healthy range at 180 cm: 18.5 -> 59.94 kg, 24.9 -> 80.68 kg
const R = BM.healthyRange(180, "who"); eq(R.lo, 18.5 * 1.8 * 1.8, "lo"); eq(R.hi, 24.9 * 1.8 * 1.8, "hi"); eq(BM.healthyRange(180, "asia").hiBmi, 22.9, "asia hi");
// gain / lose (as the old text: gain between (18.5 h^2 - w) and (24.9 h^2 - w); lose between (w - 24.9 h^2) and (w - 18.5 h^2))
let g = BM.toNormal(50, 180, "who"); eq(g.dir, "gain", "gain"); eq(g.min, 18.5 * 3.24 - 50, "gain min"); eq(g.max, 24.9 * 3.24 - 50, "gain max");
let l = BM.toNormal(95, 180, "who"); eq(l.dir, "lose", "lose"); eq(l.min, 95 - 24.9 * 3.24, "lose min"); eq(l.max, 95 - 18.5 * 3.24, "lose max"); eq(BM.toNormal(70, 180, "who").dir, "none", "none");
eq(BM.prime(25, "who"), 1, "prime"); eq(BM.ponderal(70, 175), 70 / Math.pow(1.75, 3), "ponderal");
// entries + share
eq(BM.cleanEntry({ d: "2026-10-01", kg: "70.123", cm: "175", n: "x" }), { d: "2026-10-01", kg: 70.12, cm: 175, n: "x" }, "clean"); eq(BM.cleanEntry({ d: "bad", kg: 70, cm: 175 }), null, "bad date"); eq(BM.cleanEntry({ d: "2026-10-01", kg: 5000, cm: 175 }), null, "bad kg");
eq(BM.sortEntries([{ d: "2026-02-01" }, { d: "2025-12-31" }]).map(e => e.d), ["2025-12-31", "2026-02-01"], "sort");
const st = { kg: "70.5", cm: "175", scale: "asia", history: [{ d: "2026-10-02", kg: 70, cm: 175, n: "after trip ✓" }, { d: "2026-09-01", kg: 72, cm: 175, n: "" }] };
const d = BM.decode(BM.encode(st)); eq(d.kg, "70.5", "kg"); eq(d.scale, "asia", "scale"); eq(d.history.length, 2, "hist"); eq(d.history[0].d, "2026-09-01", "sorted in link"); eq(d.history[1].n, "after trip ✓", "unicode"); eq(BM.decode("junk"), null, "bad");
eq(BM.fromOldShare({ weight: 65.8, height: 182.9 }), { kg: "65.8", cm: "182.9" }, "old"); eq(BM.fromOldShare({}), null, "old empty"); eq(BM.fromOldShare('{"weight":70,"height":175}').kg, "70", "old string");
// India (2009 consensus guideline): underweight < 18, normal 18-22.9, overweight 23-24.9, obese from 25
eq(BM.category(17.9, "india").name, "Underweight", "india 17.9"); eq(BM.category(17.96, "india").group, "normal", "17.96 rounds to 18.0"); eq(BM.category(22.9, "india").group, "normal", "india 22.9"); eq(BM.category(23, "india").name, "Overweight", "india 23");
eq(BM.category(24.9, "india").group, "over", "india 24.9"); eq(BM.category(25, "india").name, "Obese", "india 25"); eq(BM.category(40, "india").name, "Obese", "india 40");
const RI = BM.healthyRange(170, "india"); eq(RI.loBmi, 18, "india lo"); eq(RI.hiBmi, 22.9, "india hi"); eq(RI.lo, 18 * 2.89, "india lo kg"); eq(BM.prime(23, "india"), 1, "india prime");
eq(BM.decode(BM.encode({ kg: "70", cm: "170", scale: "india", history: [] })).scale, "india", "india in links"); eq(BM.decode(BM.encode({ kg: "70", cm: "170", scale: "who", history: [] })).scale, "who", "who in links");
// typed numbers on decimal-comma pages
eq(BM.numLoc("68,5", true), 68.5, "comma decimal"); eq(BM.numLoc("68.5", true), 68.5, "dot still works"); eq(BM.numLoc("1.234,5", true), 1234.5, "dot thousands"); eq(BM.numLoc("170", true), 170, "integer");
eq(BM.numLoc("182,88", true), 182.88, "two decimals"); eq(BM.numLoc("65,855", true), 65.855, "three decimals are not thousands on a comma page"); eq(BM.numLoc(" 70 ", true), 70, "spaces"); eq(BM.numLoc("abc", true), null, "bad"); eq(BM.numLoc("1,200", false), 1200, "en unchanged"); eq(BM.numLoc("٧٠٫٥", false), 70.5, "Arabic-Indic digits"); eq(BM.numLoc("۱۷۰", false), 170, "Persian digits");
// i18n: every language has every key of the English source (nested objects too), same placeholders, and nothing empty except scaleHint
const I = require("./bmicalculator/i18n.js"), EN = I.table.en, fs = require("fs"), path = require("path");
const ph = s => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
const optional = { scaleHint: 1, catl: 1, scaleIndia: 1, scaleShortIndia: 1, refIndia: 1 };   // the India scale is offered on the English and Hindi pages only
for (const code of I.langs) {
	const T = I.table[code];
	for (const k of Object.keys(EN)) {
		n++; if (!(k in T)) { f++; console.log("FAIL", code, "missing key", k); continue; }
		const e = EN[k], v = T[k];
		if (typeof e === "string") {
			eq(typeof v, "string", code + "." + k + " type");
			if (!optional[k]) eq(v.trim().length > 0, true, code + "." + k + " empty");
			if (k !== "verdictGain" && k !== "verdictLose") eq(ph(v), ph(e), code + "." + k + " placeholders");
			else eq(/\{min\}/.test(v) && /\{max\}/.test(v) && /\{cat\}|\{catl\}/.test(v), true, code + "." + k + " placeholders");
			if (/^(ph|notePh|chartAria|deleteAria|langLabel)/.test(k)) eq(v.indexOf('"'), -1, code + "." + k + " no double quote (attribute)");
		} else if (Array.isArray(e)) {
			eq(Array.isArray(v) && v.length === e.length, true, code + "." + k + " array");
			if (k === "examples") v.forEach((x, i) => { const b = BM.bmi(+x[1], +x[2]); eq(b > 10 && b < 60, true, code + " example " + i); });
		} else if (k === "saved") { eq(typeof v.other === "string" && /\{n\}/.test(v.other), true, code + ".saved.other"); }
		else for (const kk of Object.keys(e)) { n++; if (!(kk in v) || !String(v[kk]).trim()) { f++; console.log("FAIL", code, "missing", k + "." + kk); } }
	}
	for (const k of Object.keys(T)) if (!(k in EN)) { n++; f++; console.log("FAIL", code, "extra key not in English", k); }
	eq(Object.keys(T.cats).sort().join("|"), I.CATS_EN.slice().sort().join("|"), code + " categories");
	eq(!!T.scaleIndia === !!T.scaleShortIndia && !!T.scaleIndia === !!T.refIndia, true, code + " India scale strings all or none"); if (T.defScale === "india") eq(!!T.scaleIndia, true, code + " defaults to a scale it offers");
	for (const sc of ["who", "asia", "india"]) BM.SCALES[sc].cuts.forEach(c => eq(!!T.cats[c[1]], true, code + " category " + c[1]));
	eq(T.code, code, code + " code"); eq(/^\/[a-z0-9-]+$/.test(T.path), true, code + " path");
	eq(new Intl.NumberFormat(T.locale).format(1.5).includes(T.dec), true, code + " decimal mark matches its locale");
	eq(fs.existsSync(path.join(__dirname, "bmicalculator", "seo", code + ".html")), true, code + " seo file");
	const seo = fs.readFileSync(path.join(__dirname, "bmicalculator", "seo", code + ".html"), "utf8"); eq(seo.includes('id="bm-ref"'), true, code + " seo has the category table");
}
eq(new Set(I.langs.map(c => I.table[c].path)).size, I.langs.length, "paths are unique");
console.log(f ? f + " of " + n + " FAILED" : "all " + n + " passed"); process.exit(f ? 1 : 0);
