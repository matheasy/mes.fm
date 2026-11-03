// node tool_apps_src/practice-tests-tests.js  -- MES Practice Tests (tool_apps_src/practice-tests/lib.js + passages.js)
"use strict";
const T = require("./practice-tests/lib.js"), P = require("./practice-tests/passages.js");
let n = 0, bad = 0;
const fails = {};
function ok(c, m) { n++; if (!c) { bad++; const k = m.replace(/\d+/g, "#"); fails[k] = (fails[k] || 0) + 1; if (fails[k] <= 3) console.log("FAIL", m); } }
const strip = s => String(s).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
const close = (a, b, t) => Math.abs(a - b) <= (t || 1e-9);
const SEEDS = +process.env.SEEDS || 400;

// ---------- parseNum ----------
[["1 245", 1245], ["1,245", 1245], ["$3.50", 3.5], ["3.5", 3.5], ["−8", -8], ["-8", -8], ["3/4", 0.75], ["1 1/2", 1.5], ["24 cm", 24], ["45°", 45], ["12%", 12], ["12 345", 12345], [".5", 0.5], ["7 square units", 7], ["35 minutes", 35], ["10 000", 10000], ["€", NaN], ["abc", NaN], ["", NaN]]
	.forEach(([s, v]) => ok(isNaN(v) ? isNaN(T.parseNum(s)) : close(T.parseNum(s), v), "parseNum " + s + " -> " + T.parseNum(s)));

// ---------- independent answers (recomputed from item.data, not from the generator's own maths) ----------
const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
const fracVal = html => { const m = String(html).match(/<span>(\d+)<\/span><span>(\d+)<\/span>/); if (m) return (/^−/.test(strip(html)) ? -1 : 1) * m[1] / m[2]; return T.parseNum(strip(html)); };
const choiceVal = c => /pt-fr/.test(c) ? fracVal(c) : strip(c).endsWith("%") ? T.parseNum(strip(c)) / 100 : T.parseNum(strip(c));
const V = {
	"g4-place": (it, d) => it.q.includes("expanded") ? strip(it.choices[it.answer]).replace(/\s| /g, "").split("+").reduce((s, x) => s + +x, 0) === d.n : T.parseNum(strip(it.choices[it.answer])) === d.val && String(d.n).split("").filter(x => +x === d.d).length === 1,
	"g4-round": (it, d) => it.answer === Math.round(d.n / d.place) * d.place,
	"g4-compare": (it, d) => T.parseNum(strip(it.choices[it.answer])) === (d.most ? Math.max(...d.nums) : Math.min(...d.nums)),
	"g4-numline": (it, d) => close(it.answer, d.start + d.at * d.step, 1e-6),
	"g4-addsub": (it, d) => it.answer === (d.op === "as" ? d.a + d.b - d.c : d.op === "+" ? d.a + d.b : d.a - d.b) && it.answer >= 0,
	"g4-mult": (it, d) => it.type === "mc" ? strip(it.choices[it.answer]).endsWith("= " + d.a * d.b) : it.answer === d.a * d.b,
	"g4-div": (it, d) => it.answer === (d.kind === "share" || d.kind === "packs" ? Math.floor(d.n / d.b) : d.kind === "left" ? d.n % d.b : Math.ceil(d.n / d.b)),
	"g4-missing": (it, d) => { const s = d.s.replace("☐", "(" + it.answer + ")").replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-"); const [l, r] = s.split("="); return close(eval(l), eval(r)); },
	"g4-fracshade": (it, d) => close(fracVal(it.choices[it.answer]), (d.not ? d.n - d.k : d.k) / d.n),
	"g4-fraceq": (it, d) => d.fs ? close(fracVal(it.choices[it.answer]), Math.max(...d.fs.map(f => f[0] / f[1]))) : close(fracVal(it.choices[it.answer]), d.b[0] / d.b[1]) && it.choices.filter(c => close(fracVal(c), d.b[0] / d.b[1])).length === 1,
	"g4-decimal": (it, d) => d.set ? T.parseNum(strip(it.choices[it.answer])) === Math.max(...d.set) : close(T.parseNum(strip(it.choices[it.answer])), d.k / (d.hund ? 100 : 10)),
	"g4-change": (it, d) => close(it.answer * 100, d.pay - d.costs.reduce((s, x) => s + x, 0), 1e-6) && it.answer > 0,
	"g4-coins": (it, d) => close(it.answer * 100, (d.price || 0) ? d.price - d.list.reduce((s, x) => s + x, 0) : d.list.reduce((s, x) => s + x, 0), 1e-6),
	"g4-clock": (it, d) => strip(it.choices[it.answer]) === d.h + ":" + String(d.m).padStart(2, "0"),
	"g4-elapsed": (it, d) => it.type === "num" ? it.answer === d.dur : strip(it.choices[it.answer]) === T.hm(d.start + d.dur),
	"g4-perimarea": (it, d) => it.answer === (d.W ? d.W * d.H - d.cw * d.ch : d.area ? d.w * d.h : 2 * (d.w + d.h)),
	"g4-convert": (it, d) => { const s = d.q.replace(/ /g, ""), F = { m: 100, cm: 1, mm: 0.1, km: 100000, kg: 1000, g: 1, L: 1000, mL: 1 }, m = s.match(/^([\d.]+) (\w+)(?: ([\d.]+) (\w+))? = ☐ (\w+)$/); if (!m) return false; const tot = m[1] * F[m[2]] + (m[3] ? m[3] * F[m[4]] : 0); return close(it.answer * F[m[5]], tot, 1e-6); },
	"g4-shapes": (it, d) => d.s ? it.answer === { cube: [6, 12, 8], "rectangular prism": [6, 12, 8], "triangular prism": [5, 9, 6], "square-based pyramid": [5, 8, 5], "triangular pyramid": [4, 6, 4], "pentagonal prism": [7, 15, 10] }[d.s][d.what === "faces" ? 0 : d.what === "edges" ? 1 : 2] : (it.choices[it.answer].match(/points="([^"]+)"/)[1].trim().split(" ").length === d.sides),
	"g4-symmetry": (it, d) => it.answer === { square: 4, rectangle: 2, "equilateral triangle": 3, hexagon: 6, pentagon: 5, "isosceles triangle": 1, "scalene triangle": 0, rhombus: 2, parallelogram: 0, "isosceles trapezoid": 1, octagon: 8 }[d.s],
	"g4-pattern": (it, d) => { const s = d.seq, d1 = s[1] - s[0], d2 = s[2] - s[1]; if (it.q.includes("10th")) return it.answer === s[0] + 9 * d1; if (d1 === d2) return it.answer === s[4] + d1; if (s.every((x, i) => !i || x === 2 * s[i - 1])) return it.answer === 2 * s[4]; return it.answer === s[4] + (s[4] - s[3]) + 1; },
	"g4-rule": (it, d) => it.type === "mc" ? strip(it.choices[it.answer]) === "Multiply by " + d.m && d.rows.every(r => r[1] === r[0] * d.m) : it.answer === d.m * d.x + d.b,
	"g4-bars": (it, d) => { const v = d.vals; if (it.q.includes("total")) return it.answer === v.reduce((s, x) => s + x, 0); if (it.q.includes("more")) { const nm = [...it.q.matchAll(/<b>([^<]+)<\/b>/g)].map(m => m[1]); return it.answer === v[d.cats.indexOf(nm[0])] - v[d.cats.indexOf(nm[1])] && it.answer > 0; } const nm = it.q.match(/<b>([^<]+)<\/b>/)[1]; return it.answer === v[d.cats.findIndex(c => c.toLowerCase() === nm.toLowerCase())]; },
	"g4-picto": (it, d) => it.answer === d.counts[d.d] * d.key && Number.isInteger(it.answer),
	"g4-chance": (it, d) => { if (d.e) { const w = d.n === 0 ? "Impossible" : d.n === d.tot ? "Certain" : 2 * d.n > d.tot ? "Likely" : "Unlikely"; return strip(it.choices[it.answer]) === w; } const t = d.most ? Math.max(...d.counts) : Math.min(...d.counts); return strip(it.choices[it.answer]).toLowerCase() === ["red", "blue", "green", "yellow"][d.counts.indexOf(t)] && d.counts.filter(x => x === t).length === 1; },
	"g7-int": (it, d) => d.q ? close(it.answer, eval(d.q.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-"))) : d.sub !== undefined ? it.answer === (d.sub ? d.a - d.b : d.a + d.b) : it.answer === d.a + d.b,
	"g7-intline": (it, d) => it.answer === d.start + d.at * d.step && d.start < 0,
	"g7-order": (it, d) => close(it.answer, eval(d.s.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/(\d+)²/g, "($1*$1)"))),
	"g7-decimal": (it, d) => d.x ? close(it.answer * 100, d.x + d.y, 1e-6) : d.p ? close(it.answer * 100, d.p * d.n, 1e-6) : d.tot ? close(it.answer * 100 * d.m, d.tot, 1e-6) : close(it.answer, d.kg - d.kg2, 1e-9),
	"g7-percent": (it, d) => d.base ? close(it.answer, d.base * d.p / 100) : d.off ? close(it.answer, d.price * (100 - d.off) / 10000, 1e-6) : d.pr ? close(it.answer, d.pr * 1.12 / 100, 1e-6) && Number.isInteger(Math.round(d.pr * 12) / 100) : close(it.answer, (d.nw - d.old) / d.old * 100, 1e-6) && Number.isInteger(d.nw),
	"g7-fracops": (it, d) => close(fracVal(it.choices[it.answer]), d.sub ? d.a / d.b - d.c / d.d : d.a / d.b + d.c / d.d, 1e-9) && gcd(d.ans[0], d.ans[1]) === 1,
	"g7-fdp": (it, d) => d.vals ? close(choiceVal(it.choices[it.answer]), Math.max(...d.vals), 1e-6) : it.type === "num" ? close(it.answer, d.f[0] / d.f[1] * 100, 1e-6) : close(T.parseNum(strip(it.choices[it.answer])), d.f[0] / d.f[1], 1e-9),
	"g7-ratio": (it, d) => d.A ? (() => { const [x, y] = strip(it.choices[it.answer]).split(":").map(Number); return x * d.B === y * d.A && gcd(x, y) === 1; })() : it.q.includes("beach") ? it.answer === d.r2 * d.m : it.answer === d.r1 * d.m,
	"g7-rate": (it, d) => d.n ? close(it.answer * d.n * 100, d.tot, 1e-6) : d.p1 ? strip(it.choices[it.answer]).startsWith(d.p1 / d.n1 < d.p2 / d.n2 ? "Pack A" : "Pack B") && d.p1 / d.n1 !== d.p2 / d.n2 : close(it.answer * d.h, d.dist, 1e-9),
	"g7-eq": (it, d) => { const [l, r] = d.s.replace(/−/g, "-").split("="); const ev = e => eval(e.replace(/(\d)x/g, "$1*x").replace(/x/g, "(" + it.answer + ")")); return close(ev(l), ev(r)); },
	"g7-linear": (it, d) => it.type === "mc" ? (() => { const s = strip(it.choices[it.answer]).replace(/−/g, "-").replace(/\s/g, ""); const m = s.match(/^(\d*)n([+-]\d+)?$/); return m && (+(m[1] || 1)) === d.m && (+(m[2] || 0)) === d.b; })() : it.answer === d.m * d.x + d.b,
	"g7-area": (it, d) => close(it.answer, d.kind === "parallelogram" ? d.b * d.h : d.kind === "triangle" ? d.b * d.h / 2 : (d.a + d.b) * d.h / 2),
	"g7-circle": (it, d) => { const r = d.dia ? d.v / 2 : d.v; if (!it.tol) return it.answer === (d.dia ? r : 2 * r); return close(it.answer, d.area ? 3.14 * r * r : 6.28 * r, 0.006) && close(it.alts[0], d.area ? Math.PI * r * r : 2 * Math.PI * r, 0.006); },
	"g7-angles": (it, d) => { if (it.q.includes("straight")) return it.answer === 180 - d.a; if (it.q.includes("isosceles")) return 2 * it.answer + d.a === 180; return it.answer + d.a + d.b === 180 && it.answer > 0; },
	"g7-coords": (it, d) => strip(it.choices[it.answer]).replace(/−/g, "-") === "(" + (d.x + (d.dx || 0)) + ", " + (d.y + (d.dy || 0)) + ")",
	"g7-stats": (it, d) => { if (d.part) { return (d.part.reduce((s, x) => s + x, 0) + it.answer) / (d.part.length + 1) === d.target; } const a = d.data.slice().sort((x, y) => x - y); if (d.what === "range") return it.answer === a[a.length - 1] - a[0]; if (d.what === "median") return it.answer === a[(a.length - 1) / 2]; if (d.what === "mean") return it.answer === a.reduce((s, x) => s + x, 0) / a.length && Number.isInteger(it.answer); const c = {}; a.forEach(x => c[x] = (c[x] || 0) + 1); const mx = Math.max(...Object.values(c)); return c[it.answer] === mx && Object.values(c).filter(v => v === mx).length === 1; },
	"g7-prob": (it, d) => close(fracVal(it.choices[it.answer]) || T.parseNum(strip(it.choices[it.answer])), d.num / d.den)
};

// ---------- every generator, every difficulty, many seeds ----------
const inputFor = it => it.type === "mc" ? it.answer : it.type === "multi" ? it.answer : (it.prefix || "") + (it.money ? it.answer.toFixed(2) : T.fmt(it.answer));
T.GENS.forEach(g => {
	ok(V[g.id], "independent check exists for " + g.id);
	ok(T.TOPICS[g.grade].some(t => t[0] === g.topic), "known topic " + g.id);
	T.DIFFS.forEach(diff => {
		const keys = new Set();
		for (let s = 1; s <= SEEDS; s++) {
			const R = T.Rand(T.hashStr(g.id + diff) + s * 7919);
			let it;
			try { it = T.makeItem(g, R, diff, g.grade); } catch (e) { ok(false, g.id + " " + diff + " seed " + s + " threw " + e.message); continue; }
			const tag = g.id + " " + diff + " #" + s;
			keys.add(it.key);
			ok(["mc", "num", "multi"].includes(it.type), "type " + tag);
			ok(typeof it.key === "string" && it.key.length > 1, "key " + tag);
			const all = [it.q, it.svg || "", it.html || "", it.explain, (it.choices || []).join("|"), String(it.answer)].join(" ");
			ok(!/undefined|NaN|Infinity|\[object/.test(all), "no undefined/NaN " + tag + " :: " + all.slice(0, 200));
			ok((all.match(/<svg/g) || []).length === (all.match(/<\/svg>/g) || []).length, "svg tags balanced " + tag);
			ok(strip(it.explain).length > 20, "has explanation " + tag);
			if (it.type === "mc") {
				ok(it.choices.length === 4 || (it.choices.length >= 3 && g.id === "g7-rate"), "4 choices " + tag);
				ok(new Set(it.choices).size === it.choices.length, "unique choices " + tag + " " + it.choices.map(strip).join(" | "));
				ok(it.answer >= 0 && it.answer < it.choices.length, "answer index " + tag);
			} else {
				ok(isFinite(it.answer), "finite answer " + tag);
				ok(it.answer >= 0 || it.neg, "non-negative or flagged " + tag + " " + it.answer);
				ok(Math.abs(it.answer * 1e6 - Math.round(it.answer * 1e6)) < 1e-3, "tidy number " + tag + " " + it.answer);
			}
			ok(T.checkAnswer(it, inputFor(it)).score === 1, "correct answer scores 1 " + tag + " input " + inputFor(it));
			if (it.type === "num") ok(T.checkAnswer(it, String(it.answer + 1)).score === 0, "wrong answer scores 0 " + tag);
			if (it.type === "mc") ok(T.checkAnswer(it, (it.answer + 1) % it.choices.length).score === 0, "wrong choice scores 0 " + tag);
			ok(it.fit >= 2 && it.fit <= 8 && T.fitLabel(it.fit).includes("ages"), "fit label " + tag);
			if (V[g.id]) { let v = false; try { v = V[g.id](it, it.data || {}); } catch (e) { v = false; } ok(v, "independent answer check " + tag + " :: " + strip(it.q).slice(0, 120) + " => " + (it.type === "mc" ? strip(it.choices[it.answer]) : it.answer)); }
		}
		ok(keys.size >= Math.min(4, SEEDS / 20), "variety " + g.id + " " + diff + " (" + keys.size + " different items)");
	});
});

// ---------- passages ----------
const SK = T.SKILLS.map(s => s[0]);
const ids = new Set();
P.forEach(p => {
	ok(!ids.has(p.id), "unique passage id " + p.id); ids.add(p.id);
	ok([4, 7].includes(p.grade) && T.GENRES[p.genre], "grade / genre " + p.id);
	ok(strip(p.html).split(" ").length > (p.genre === "poem" ? 50 : 80), "passage long enough " + p.id);
	ok(p.qs.length >= 5, "5+ questions " + p.id);
	ok(p.qs.some(q => q.type === "written"), "has a written question " + p.id);
	p.qs.forEach((q, i) => {
		const tag = p.id + "#" + i;
		ok(SK.includes(q.skill), "known skill " + tag + " " + q.skill);
		ok(T.DIFFS.includes(q.diff), "diff " + tag);
		ok(q.q && strip(q.why || q.rubric || "").length > 15, "question + explanation " + tag);
		if (q.type === "mc") { ok(q.c.length === 4 && new Set(q.c).size === 4, "4 unique choices " + tag); }
		else if (q.type === "multi") { ok(q.c.length >= 4 && q.right.length === 2 && q.right.every(r => r < q.c.length) && /TWO/.test(q.q), "multi " + tag); }
		else if (q.type === "order") { ok(q.c.length >= 3 && new Set(q.c).size === q.c.length, "order " + tag); }
		else if (q.type === "written") {
			ok(q.model && q.keys.length >= q.need && q.rubric, "written fields " + tag);
			ok(T.writtenScore({ keys: q.keys, need: q.need }, q.model).score === 1, "model answer gets full marks " + tag + " hits " + T.writtenScore({ keys: q.keys, need: q.need }, q.model).hit);
			ok(T.writtenScore({ keys: q.keys, need: q.need }, "I don't know").score === 0, "empty-ish answer gets 0 " + tag);
		} else ok(false, "question type " + tag);
	});
});
[4, 7].forEach(g => Object.keys(T.GENRES).forEach(ge => { if (ge !== "opinion") ok(T.passagesFor(g).some(p => p.genre === ge) || (ge === "opinion"), "grade " + g + " has a " + ge); }));
[4, 7].forEach(g => SK.forEach(s => ok(T.passagesFor(g).some(p => p.qs.some(q => q.skill === s)), "grade " + g + " has skill " + s)));

// ---------- whole tests ----------
[4, 7].forEach(grade => ["numeracy", "literacy"].forEach(subject => ["full", "quick", "topic"].forEach(mode => ["mixed", "easy", "medium", "hard"].forEach(diff => {
	for (let s = 1; s <= 60; s++) {
		const topics = mode === "topic" ? [subject === "numeracy" ? T.TOPICS[grade][s % T.TOPICS[grade].length][0] : T.SKILLS[s % T.SKILLS.length][0]] : [];
		const cfg = { grade, subject, mode, diff, topics, seed: 1000 + s * 31 };
		const tag = [grade, subject, mode, diff, s].join(" ");
		const items = T.buildTest(cfg), again = T.buildTest(cfg);
		ok(items.length > 0, "items " + tag);
		ok(items.map(i => i.key).join() === again.map(i => i.key).join(), "same seed same test " + tag);
		ok(new Set(items.map(i => i.key)).size === items.length, "no repeated question " + tag);
		if (subject === "numeracy") {
			ok(items.length === T.LENGTH.numeracy[mode], "length " + tag);
			if (mode === "topic") ok(items.every(i => i.topic === topics[0]), "topic only " + tag);
			if (diff !== "mixed") ok(items.every(i => i.diff === diff), "difficulty only " + tag);
			if (mode === "full") ok(new Set(items.map(i => i.topic)).size === T.TOPICS[grade].length, "full test covers every topic " + tag);
		} else {
			if (mode === "topic") ok(items.every(i => i.topic === topics[0]) && items.length <= 10, "skill only " + tag);
			else { const ps = new Set(items.map(i => i.passage)); ok(ps.size === T.LENGTH.literacy[mode], "passages " + tag); if (mode === "full") ok(new Set([...ps].map(id => T.passageById(id).genre)).size >= 3, "mixed genres " + tag); }
			items.forEach(it => { if (it.type === "mc") ok(it.choices[it.answer] === P.find(p => p.id === it.passage).qs[+it.key.split("#")[1]].c[0], "shuffled answer still right " + tag);
				if (it.type === "order") ok(T.checkAnswer(it, it.answer).score === 1 && T.checkAnswer(it, it.start).score === 0, "order check " + tag);
				if (it.type === "multi") ok(T.checkAnswer(it, it.answer).score === 1 && T.checkAnswer(it, [it.answer[0]]).score === 0.5, "multi check " + tag); });
		}
		const sc = T.score(items, items.map(it => it.type === "written" ? { text: it.model } : it.type === "num" ? String(it.answer) : it.answer));
		ok(sc.got === items.length && sc.pct === 100, "all right = 100% " + tag + " got " + sc.got + "/" + items.length);
		ok(T.score(items, []).got === 0, "blank = 0 " + tag);
	}
}))));
// different seeds give different tests
const a = T.buildTest({ grade: 4, subject: "numeracy", mode: "full", diff: "mixed", seed: 1 }).map(i => i.key).join(), b = T.buildTest({ grade: 4, subject: "numeracy", mode: "full", diff: "mixed", seed: 2 }).map(i => i.key).join();
ok(a !== b, "different seeds differ");
ok(T.checkAnswer({ type: "written", keys: [["x"]], need: 1 }, { text: "anything at all here", mark: 0.5 }).score === 0.5, "self mark wins");

console.log((bad ? "FAILED " + bad + " of " : "ok, all ") + n + " checks");
process.exit(bad ? 1 : 0);
