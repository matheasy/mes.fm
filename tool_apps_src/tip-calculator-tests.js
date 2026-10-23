// node tool_apps_src/tip-calculator-tests.js
"use strict";
const TP = require("./tip-calculator/lib.js");
let pass = 0, fail = 0;
function eq(a, b, msg) { const A = JSON.stringify(a), B = JSON.stringify(b); if (A === B) pass++; else { fail++; console.log("FAIL", msg, "\n  got ", A, "\n  want", B); } }
function ok(c, msg) { eq(!!c, true, msg); }
const sum = a => a.reduce((x, y) => x + y, 0);

// parsing
eq(TP.parseMoney("45"), 4500, "45");
eq(TP.parseMoney("$1,234.56"), 123456, "US grouping");
eq(TP.parseMoney("1.234,56"), 123456, "EU grouping");
eq(TP.parseMoney("12,5"), 1250, "decimal comma");
eq(TP.parseMoney("1 200"), 120000, "space grouping");
eq(TP.parseMoney("1,234"), 123400, "thousands comma");
eq(TP.parseMoney("0.125"), 13, "three decimals round");
eq(TP.parseMoney("150.000", 0), 150000, "VND dot grouping");
eq(TP.parseMoney("2500", 0), 2500, "JPY");
eq(TP.parseMoney("abc"), null, "garbage");
eq(TP.parseMoney(""), null, "empty");
eq(TP.parsePct("17.5"), 17500, "pct");
eq(TP.parsePct("18%"), 18000, "pct sign");
eq(TP.parsePct("12,5"), 12500, "pct comma");
eq(TP.fmt(123456, TP.cur("USD")), "$1,234.56", "fmt usd");
eq(TP.fmt(5, TP.cur("USD")), "$0.05", "fmt cents");
eq(TP.fmt(150000, TP.cur("VND")), "150,000 ₫", "fmt vnd");
eq(TP.curForLocale("en-GB"), "GBP", "locale GB");
eq(TP.curForLocale("vi-VN"), "VND", "locale VN");
eq(TP.curForLocale("en"), "USD", "locale none");

// tip maths
eq(TP.pctOf(5000, 18000), 900, "18% of 50");
eq(TP.pctOf(4567, 15000), 685, "15% of 45.67 = 6.8505 -> 6.85");
eq(TP.pctOf(1003, 15000), 150, "15% of 10.03 = 1.5045 -> 1.50");
eq(TP.pctOf(1010, 15000), 152, "15% of 10.10 = 1.515 -> 1.52 (half up)");
eq(TP.taxIncluded(11300, 13000), 1300, "13% HST inside 113.00");
eq(TP.taxIncluded(10500, 5000), 500, "5% inside 105");

// splitting sums exactly
for (let t = 0; t < 500; t++) {
	const total = Math.floor(Math.random() * 1e6), n = 1 + Math.floor(Math.random() * 15);
	const s = TP.splitEven(total, n);
	if (sum(s) !== total || Math.max(...s) - Math.min(...s) > 1) { fail++; console.log("FAIL splitEven", total, n, s); break; }
	const w = Array.from({ length: n }, () => Math.floor(Math.random() * 5000));
	const a = TP.allocate(total, w);
	if (sum(a) !== total) { fail++; console.log("FAIL allocate sum", total, w, a); break; }
	const W = sum(w);
	if (W > 0 && a.some((x, i) => Math.abs(x - total * w[i] / W) >= 1)) { fail++; console.log("FAIL allocate fairness", total, w, a); break; }
}
pass++;
eq(TP.splitEven(10000, 3), [3334, 3333, 3333], "100 / 3");
eq(TP.allocate(100, [1, 1, 1]), [34, 33, 33], "allocate equal");
eq(TP.allocate(100, [1, 1, 1], 1), [33, 34, 33], "allocate rotates");
eq(TP.allocate(100, [0, 0]), [50, 50], "allocate zero weights");

// even split
let r = TP.even({ bill: 8000, tipMode: "pct", tipPct: 20000, people: 3 });
eq([r.tip, r.total], [1600, 9600], "20% of 80");
eq(r.shares, [3200, 3200, 3200], "96 / 3");
r = TP.even({ bill: 10000, tipMode: "pct", tipPct: 15000, people: 3 });
eq([r.total, r.shares, r.uneven, r.extraCents], [11500, [3834, 3833, 3833], true, 1], "115 / 3 leftover cent");
eq(sum(r.shares), r.total, "shares sum");
// tax before tip
r = TP.even({ bill: 11300, preTax: true, taxMode: "pct", taxPct: 13000, tipMode: "pct", tipPct: 18000, people: 1 });
eq([r.tax, r.base, r.tip, r.total], [1300, 10000, 1800, 13100], "tip on pre-tax (13% inside)");
r = TP.even({ bill: 11300, preTax: true, taxMode: "amt", tax: 1300, tipMode: "pct", tipPct: 18000, people: 2 });
eq([r.tip, r.total, r.shares], [1800, 13100, [6550, 6550]], "tip on pre-tax (tax amount)");
r = TP.even({ bill: 11300, preTax: false, tax: 1300, tipMode: "pct", tipPct: 18000, people: 1 });
eq(r.tip, 2034, "tip on full bill ignores tax");
// tip amount
r = TP.even({ bill: 4000, tipMode: "amt", tipAmt: 700, people: 2 });
eq([r.total, r.effPct], [4700, 17500], "tip amount -> 17.5%");
// rounding
r = TP.even({ bill: 4567, tipMode: "pct", tipPct: 18000, people: 1, round: "total", step: 100 });
eq([r.total, r.tip, r.rounded], [5400, 833, true], "round total up to whole");
eq(r.effPct, Math.round(833 * 100000 / 4567), "effective pct after rounding");
r = TP.even({ bill: 10000, tipMode: "pct", tipPct: 15000, people: 3, round: "person", step: 100 });
eq([r.perPerson, r.total, r.tip, r.shares], [3900, 11700, 1700, [3900, 3900, 3900]], "round each share up to 1");
r = TP.even({ bill: 10000, tipMode: "pct", tipPct: 15000, people: 3, round: "person", step: 50 });
eq([r.perPerson, r.total], [3850, 11550], "round each share up to 0.50");
r = TP.even({ bill: 10000, tipMode: "pct", tipPct: 15000, people: 3, round: "person", step: 25 });
eq([r.perPerson, r.total], [3850, 11550], "round each share up to 0.25");
r = TP.even({ bill: 8000, tipMode: "pct", tipPct: 20000, people: 4, round: "total", step: 100 });
eq([r.total, r.rounded], [9600, false], "already whole");
r = TP.even({ bill: 0, tipMode: "pct", tipPct: 20000, people: 2 });
eq([r.tip, r.total, r.effPct], [0, 0, null], "zero bill");

// uneven split with shared items
let u = TP.uneven({
	people: [{ name: "Ann", items: [2000] }, { name: "Ben", items: [1500, 500] }, { name: "Cy", items: [1000] }],
	shared: [{ name: "Nachos", amount: 1000, who: [0, 1] }, { name: "Wine", amount: 3000, who: [] }],
	taxMode: "pct", taxPct: 10000, tipMode: "pct", tipPct: 20000, tipOnTax: false
});
eq(u.rows.map(r => r.sub), [3500, 3500, 2000], "subtotals with shared");
eq(u.subtotal, 9000, "subtotal");
eq([u.tax, u.tip, u.total], [900, 1800, 11700], "tax and tip on items");
eq(sum(u.rows.map(r => r.pay)), u.total, "uneven shares sum to total");
eq(u.rows.map(r => r.pay), [4550, 4550, 2600], "uneven pays");
u = TP.uneven({ people: [{ items: [1000] }, { items: [1000] }, { items: [1000] }], shared: [], taxMode: "amt", tax: 100, tipMode: "amt", tipAmt: 500, tipOnTax: true });
eq(sum(u.rows.map(r => r.tax)), 100, "tax distributed exactly");
eq(sum(u.rows.map(r => r.tip)), 500, "tip distributed exactly");
eq(sum(u.rows.map(r => r.pay)), u.total, "total exact");
u = TP.uneven({ people: [{ items: [1234] }, { items: [999] }], shared: [{ amount: 1001, who: [0, 1] }], taxMode: "pct", taxPct: 13000, tipMode: "pct", tipPct: 18000, tipOnTax: true, round: "person", step: 100 });
ok(u.rows.every(r => r.pay % 100 === 0), "uneven rounded to whole");
eq(sum(u.rows.map(r => r.pay)), u.total, "uneven rounded total exact");
eq(u.base, u.subtotal + u.tax, "tip on tax base");
// random uneven
for (let t = 0; t < 300; t++) {
	const n = 1 + Math.floor(Math.random() * 6);
	const people = Array.from({ length: n }, () => ({ items: Array.from({ length: Math.floor(Math.random() * 4) }, () => Math.floor(Math.random() * 5000)) }));
	const shared = Array.from({ length: Math.floor(Math.random() * 3) }, () => ({ amount: Math.floor(Math.random() * 3000), who: Array.from({ length: n }, (_, i) => i).filter(() => Math.random() < 0.6) }));
	const o = { people, shared, taxMode: Math.random() < 0.5 ? "pct" : "amt", taxPct: 8875, tax: 333, tipMode: "pct", tipPct: 18000, tipOnTax: Math.random() < 0.5, round: Math.random() < 0.5 ? "person" : "none", step: 25 };
	const x = TP.uneven(o);
	const itemSum = sum(people.map(p => sum(p.items))) + sum(shared.map(s => s.amount));
	if (x.subtotal !== itemSum || sum(x.rows.map(r => r.pay)) !== x.total || x.total !== x.subtotal + x.tax + x.tip) { fail++; console.log("FAIL random uneven", JSON.stringify(o), JSON.stringify(x)); break; }
}
pass++;

// table, data
const tb = TP.table(5000, 5000, 2);
eq(tb.map(r => r.tip), [500, 600, 750, 900, 1000, 1100, 1250], "quick table");
ok(TP.COUNTRIES.length >= 15 && TP.COUNTRIES.every(c => c.c && c.name && c.rest && c.notes && typeof c.pct === "number"), "countries data");
ok(TP.CURRENCIES.every(c => TP.steps(c).length === 3), "steps per currency");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
