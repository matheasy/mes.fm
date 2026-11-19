// node tool_apps_src/expense-splitter-tests.js  -- MESSplit (mes.fm/expense-splitter) maths
"use strict";
const S = require("./expense-splitter/lib.js");
let n = 0, bad = 0;
function ok(c, msg) { n++; if (!c) { bad++; console.log("FAIL:", msg); } }
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + " (got " + JSON.stringify(a) + ", want " + JSON.stringify(b) + ")"); }

// parsing
eq(S.parseAmount("1,234.56"), 1234.56, "us thousands");
eq(S.parseAmount("1.234,56"), 1234.56, "eu thousands");
eq(S.parseAmount("12,5"), 12.5, "decimal comma");
eq(S.parseAmount("1,000"), 1000, "comma thousands");
eq(S.parseAmount("$ 40"), 40, "symbol");
eq(S.parseAmount("12 + 4.50"), 16.5, "sum");
eq(S.parseAmount(""), 0, "blank");
eq(S.parseAmount("abc"), null, "junk");
eq(S.parseAmount("5 +"), null, "dangling plus");
eq(S.fmt(123456, "USD"), "$1,234.56", "fmt usd");
eq(S.fmt(-5, "EUR"), "-€0.05", "fmt neg");
eq(S.fmt(150000, "VND"), "₫150,000", "fmt vnd");
eq(S.fmt(1234, "CHF"), "12.34 Fr", "fmt suffix");

// allocate
eq(S.allocate(100, [1, 1, 1]), [34, 33, 33], "100/3");
eq(S.allocate(100, [1, 1, 1], [1, 0, 0]), [33, 34, 33], "tie goes to fewest extras");
eq(S.allocate(-100, [1, 1, 1]), [-34, -33, -33], "negative");
eq(S.allocate(1000, [2, 1, 1]), [500, 250, 250], "weights");
eq(S.allocate(10, [1, 0, 1]), [5, 0, 5], "zero weight");
eq(S.allocate(10, [0, 0]), null, "no weight");
for (let k = 0; k < 300; k++) {
	const w = Array.from({ length: 1 + (k % 9) }, (_, i) => ((k * 7 + i * 13) % 5) + (i === 0 ? 1 : 0));
	const tot = (k * 9973) % 100000 - 30000;
	const a = S.allocate(tot, w); ok(a && a.reduce((x, y) => x + y, 0) === tot, "allocate sums " + k);
	const ws = w.reduce((x, y) => x + y, 0);
	ok(a.every((v, i) => Math.abs(v - tot * w[i] / ws) < 1), "allocate close " + k);
}

// example trip
const ex = S.example();
const r = S.compute(ex);
ok(r.exps.every(e => !e.err), "example has no errors: " + JSON.stringify(r.exps.map(e => e.err)));
eq(r.people.reduce((s, p) => s + p.bal, 0), 0, "balances sum to zero");
eq(r.people.reduce((s, p) => s + p.owed, 0), r.total, "shares sum to total");
// gondola 185 USD @1.38 = 255.30 CAD, Mia fixed 25 USD = 34.50
eq(r.exps[5].base, 25530, "converted");
eq(r.exps[5].alloc.e5, 3450, "exact part");
eq(r.exps[5].warn, "rest", "rest split");
// beer skipped by noalc people (Sam, Mia)
eq(Object.keys(r.exps[2].alloc).sort(), ["a1", "c3", "d4"], "no-alcohol skipped");
// dinner on night 2: Jordan (1 night, night 1 only) left out
ok(r.exps[4].alloc.c3 == null, "absent night 2");
// cabin by nights: Jordan 1 night, Mia kid 2*0.5 = 1, others 2 -> total weight 8, 640/8=80
eq(r.exps[0].alloc.c3, 8000, "nights 1");
eq(r.exps[0].alloc.e5, 8000, "kid half");
eq(r.exps[0].alloc.a1, 16000, "nights 2");
// settle zeroes everyone
const after = {}; r.people.forEach(p => after[p.id] = p.bal);
r.settle.forEach(s => { after[s.from] += s.amt; after[s.to] -= s.amt; });
ok(Object.values(after).every(v => v === 0), "settle clears balances");
ok(r.settle.length <= r.people.length - 1, "at most n-1 transfers");

// fewest transfers: two independent pairs -> 2 transfers, not 3
const s1 = S.settle([{ id: "a", bal: 500 }, { id: "b", bal: -500 }, { id: "c", bal: 300 }, { id: "d", bal: -300 }]);
eq(s1.length, 2, "zero-sum groups");
const s2 = S.settle([{ id: "a", bal: 700 }, { id: "b", bal: -200 }, { id: "c", bal: -500 }, { id: "d", bal: 400 }, { id: "e", bal: -400 }]);
eq(s2.length, 3, "groups 2+3");
// random: exact solver never worse than greedy, always clears
for (let k = 0; k < 200; k++) {
	const m = 2 + (k % 10), list = [];
	let tot = 0;
	for (let i = 0; i < m - 1; i++) { const v = ((k * 31 + i * 97) % 2001) - 1000; list.push({ id: "p" + i, bal: v }); tot += v; }
	list.push({ id: "p" + (m - 1), bal: -tot });
	const st = S.settle(list), bal = {}; list.forEach(x => bal[x.id] = x.bal);
	st.forEach(s => { ok(s.amt > 0, "positive transfer"); bal[s.from] += s.amt; bal[s.to] -= s.amt; });
	ok(Object.values(bal).every(v => v === 0), "random settle clears " + k);
	ok(st.length <= list.filter(x => x.bal).length - 1 || st.length === 0, "random <= n-1 " + k);
}
// hub mode
const h = S.settle([{ id: "a", bal: 500 }, { id: "b", bal: -200 }, { id: "c", bal: -300 }], "hub", "b");
eq(h, [{ from: "b", to: "a", amt: 500 }, { from: "c", to: "b", amt: 300 }], "hub");

// payments already made count
const t2 = S.normalize(Object.assign({}, ex, { pays: r.settle.map(s => ({ from: s.from, to: s.to, amt: (s.amt / 100).toFixed(2), cur: "CAD" })) }));
const r2 = S.compute(t2);
ok(r2.people.every(p => p.bal === 0) && r2.settle.length === 0, "settled after payments");

// errors
const t3 = S.normalize({ cur: "EUR", people: [{ id: "x", name: "X" }], exps: [{ payer: "x", amt: "10", cur: "GBP" }, { payer: "", amt: "5" }, { payer: "x", amt: "zz" }] });
const r3 = S.compute(t3);
eq(r3.exps.map(e => e.err), ["rate", "payer", "amount"], "errors");
eq(r3.missingRates, ["GBP"], "missing rate");
// exact over-specified
const t4 = S.normalize({ people: [{ id: "x" }, { id: "y" }], exps: [{ payer: "x", amt: "10", rule: "exact", ex: { x: "4", y: "4" } }] });
eq(S.compute(t4).exps[0].err, "exactsum", "exact mismatch");
// shares rule
const t5 = S.normalize({ people: [{ id: "x" }, { id: "y" }], exps: [{ payer: "x", amt: "90", rule: "shares", sh: { x: 2, y: 1 } }] });
eq(S.compute(t5).exps[0].alloc, { x: 6000, y: 3000 }, "shares");
// leftover cents are spread across expenses (not always the first person)
const t6 = S.normalize({ people: [{ id: "x" }, { id: "y" }, { id: "z" }], exps: [1, 2, 3].map(() => ({ payer: "x", amt: "1.00" })) });
const o6 = S.compute(t6).people.map(p => p.owed);
eq(o6, [100, 100, 100], "odd cents rotate");

// share link round trip
const enc = S.encodePlain(ex), dec = S.decodePlain(enc);
ok(/^1[A-Za-z0-9_-]+$/.test(enc), "base64url");
eq(S.compute(dec).settle.length, r.settle.length, "round trip settle");
eq(S.compute(dec).people.map(p => [p.name, p.bal]), r.people.map(p => [p.name, p.bal]), "round trip balances");
eq(S.decodePlain("1!!!"), null, "bad link");
// csv
const csv = S.csv(r); ok(csv.split("\n")[0].startsWith("Expense,Category,Paid by"), "csv header"); ok(/Alex/.test(csv), "csv names");
ok(/pays/.test(S.settleText(r)), "settle text");
// normalize clamps junk
const t7 = S.normalize({ people: Array.from({ length: 90 }, () => ({ name: "<b>" })), exps: "x", rates: { ZZZ: 2, USD: -1 } });
eq(t7.people.length, 60, "people cap"); eq(t7.exps, [], "exps junk"); eq(t7.rates, {}, "rates junk");

console.log(bad ? bad + " of " + n + " checks FAILED" : "All " + n + " checks passed");
process.exit(bad ? 1 : 0);
