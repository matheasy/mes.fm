// Tests for tool_apps_src/money-growth/lib.js (Compound Interest + Loan calculators). Run: node tool_apps_src/money-growth-tests.js
"use strict";
var MG = require("./money-growth/lib.js");
var pass = 0, fail = 0;
function ok(c, msg) { if (c) pass++; else { fail++; console.log("FAIL: " + msg); } }
function near(a, b, tol, msg) { ok(Math.abs(a - b) <= tol, msg + " (got " + a + ", want " + b + ")"); }
function cents(x) { return Math.round(x * 100) / 100; }

// ---------- parsing
ok(MG.toNum("1,234.56") === 1234.56, "toNum 1,234.56");
ok(MG.toNum("1.234,56") === 1234.56, "toNum 1.234,56");
ok(MG.toNum("$5,000") === 5000, "toNum $5,000");
ok(MG.toCents("20000") === 2000000, "toCents");
ok(MG.toCents("19.995") === 2000, "toCents half up");
ok(MG.toCents("-5") === null && MG.toCents("abc") === null, "toCents rejects");
ok(MG.parseRate("6.5").n === 65n && MG.parseRate("6.5").d === 10n, "parseRate exact");

// ---------- compound interest: textbook values
var base = { start: 10000, dep: 0, df: "none", timing: "e", rate: 0.05, comp: "monthly", years: 10, months: 0 };
var r = MG.grow(base);
ok(cents(r.final) === 16470.09, "10,000 at 5% monthly 10 y = 16,470.09 (got " + cents(r.final) + ")");
near(r.final, 10000 * Math.pow(1 + 0.05 / 12, 120), 1e-6, "matches P(1+r/n)^(nt)");
ok(cents(MG.grow(Object.assign({}, base, { comp: "annual" })).final) === 16288.95, "annual compounding 16,288.95");
ok(cents(MG.grow(Object.assign({}, base, { comp: "daily" })).final) === 16486.65, "daily compounding 16,486.65 (got " + cents(MG.grow(Object.assign({}, base, { comp: "daily" })).final) + ")");
ok(cents(MG.grow(Object.assign({}, base, { comp: "continuous" })).final) === 16487.21, "continuous 16,487.21 = 10000 e^0.5");
ok(cents(MG.grow(Object.assign({}, base, { comp: "quarterly" })).final) === 16436.19, "quarterly 16,436.19");
near(MG.apy(0.05, "monthly"), 0.0511619, 1e-7, "APY 5% monthly = 5.116%");
near(MG.apy(0.05, "continuous"), Math.exp(0.05) - 1, 1e-15, "APY continuous");
near(MG.apy(0.05, "annual"), 0.05, 1e-15, "APY annual = nominal");

// $1000 + $100/month at 7% monthly for 30 years: closed form and a brute-force month loop
var o2 = { start: 1000, dep: 100, df: "monthly", timing: "e", rate: 0.07, comp: "monthly", years: 30, months: 0 };
var r2 = MG.grow(o2), i = 0.07 / 12, b = 1000, k;
for (k = 0; k < 360; k++) { b = b * (1 + i) + 100; }
near(r2.final, b, 1e-6, "1000 + 100/mo 7% 30 y matches brute loop");
near(r2.final, 1000 * Math.pow(1 + i, 360) + 100 * (Math.pow(1 + i, 360) - 1) / i, 1e-6, "matches annuity formula");
ok(cents(r2.final) === 130113.59 || Math.abs(r2.final - 130113.59) < 0.02, "1000 + 100/mo 7% 30 y about 130,113.59 (got " + cents(r2.final) + ")");
ok(r2.deposits === 1000 + 36000, "total deposits 37,000");
near(r2.interest, r2.final - r2.deposits, 1e-6, "interest = final - deposits");
// start of period deposits = annuity due
var r2s = MG.grow(Object.assign({}, o2, { timing: "s" })), bs = 1000;
for (k = 0; k < 360; k++) { bs = (bs + 100) * (1 + i); }
near(r2s.final, bs, 1e-6, "start-of-month deposits brute loop");
// weekly deposits, monthly compounding: closed form with step growth
var o3 = { start: 0, dep: 50, df: "weekly", timing: "e", rate: 0.06, comp: "monthly", years: 5, months: 0 };
var r3 = MG.grow(o3), g3 = MG.stepGrowth(0.06, "monthly", 52);
near(r3.final, MG.fvClosed(0, 50, g3, 260, 1, false), 1e-6, "weekly deposits vs closed form");
ok(r3.N === 260 && r3.years.length === 5, "weekly: 260 steps, 5 year rows");
// quarterly deposits on monthly steps
var o4 = { start: 500, dep: 300, df: "quarterly", timing: "e", rate: 0.04, comp: "quarterly", years: 3, months: 0 };
var r4 = MG.grow(o4), g4 = MG.stepGrowth(0.04, "quarterly", 12);
near(r4.final, MG.fvClosed(500, 300, g4, 36, 3, false), 1e-6, "quarterly deposits vs closed form");
near(r4.final, 500 * Math.pow(1.01, 12) + 300 * (Math.pow(1.01, 12) - 1) / 0.01, 1e-6, "quarterly comp + quarterly deposit = textbook");
// years + months
ok(MG.grow(Object.assign({}, base, { years: 2, months: 6 })).N === 30, "2 y 6 m = 30 months");
// year rows add up
var sumI = 0, sumD = 0; r2.years.forEach(function (y) { sumI += y.int; sumD += y.dep; });
near(sumI, r2.interest, 1e-6, "year rows: interest adds up");
near(sumD + 1000, r2.deposits, 1e-6, "year rows: deposits add up");
// deposit increase: year 2 deposits are 3% higher
var r5 = MG.grow({ start: 0, dep: 100, df: "monthly", timing: "e", rate: 0, comp: "monthly", years: 2, months: 0, inc: 0.03 });
near(r5.final, 1200 + 1236, 1e-9, "3% yearly deposit increase");
// inflation + tax
var r6 = MG.grow(Object.assign({}, base, { inf: 0.02 }));
near(r6.real, r6.final / Math.pow(1.02, 10), 1e-9, "real value deflated by inflation");
var r7 = MG.grow(Object.assign({}, base, { tax: 0.25 }));
near(r7.final, 10000 * Math.pow(1 + 0.05 / 12 * 0.75, 120), 1e-6, "25% tax on monthly interest");
near(r7.final + r7.tax, 10000 + r7.interest + r7.tax, 1e-6, "tax bookkeeping");
// zero rate
ok(MG.grow({ start: 100, dep: 10, df: "monthly", rate: 0, comp: "daily", years: 1 }).final === 220, "zero rate sums deposits");

// ---------- goal solvers round trip
var gd = MG.solveDeposit(o2, 250000);
near(MG.grow(Object.assign({}, o2, { dep: gd.dep })).final, 250000, 1e-6, "solveDeposit round trip");
var gd2 = MG.solveDeposit(Object.assign({}, o2, { inc: 0.02, tax: 0.1, timing: "s" }), 250000);
near(MG.grow(Object.assign({}, o2, { inc: 0.02, tax: 0.1, timing: "s", dep: gd2.dep })).final, 250000, 1e-6, "solveDeposit with increase + tax");
ok(MG.solveDeposit(o2, 500).reached === true, "solveDeposit: already there");
var gt = MG.solveTime(o2, 100000);
ok(gt && MG.grow(Object.assign({}, o2, { years: 0, months: gt.steps })).final >= 100000 && MG.grow(Object.assign({}, o2, { years: 0, months: gt.steps - 1 })).final < 100000, "solveTime: first month that reaches 100,000");
ok(MG.solveTime({ start: 1000, dep: 0, df: "none", rate: 0, comp: "monthly" }, 2000) === null, "solveTime: never");
var gt2 = MG.solveTime(Object.assign({}, base, { years: 0 }), 20000);
near(gt2.t, 13.9, 0.05, "10,000 doubles at 5% monthly in ~13.9 y");
var gr = MG.solveRate(o2, 200000);
near(MG.grow(Object.assign({}, o2, { rate: gr })).final, 200000, 1e-4, "solveRate round trip");
ok(MG.solveRate(o2, 10) === 0, "solveRate: 0% enough");
ok(MG.solveRate({ start: 1, df: "none", rate: 0, comp: "monthly", years: 1 }, 1e9) === null, "solveRate: impossible");

// ---------- rule of 72
near(MG.rule72(8), 9, 1e-12, "rule of 72 at 8%");
near(MG.doubling(0.08, "annual"), 9.006468, 1e-6, "exact doubling 8% annual");
near(MG.doubling(0.05, "continuous"), Math.LN2 / 0.05, 1e-9, "continuous doubling = ln2 / r");
ok(MG.doubling(0, "annual") === Infinity, "no growth never doubles");

// ---------- loans
var R6 = MG.parseRate("6");
var s1 = MG.schedule({ loan: 2000000, rate: R6, freq: "monthly", n: 60, start: { y: 2026, m: 1, d: 15 } });
ok(s1.pay === 38666, "20,000 at 6% for 60 months = 386.66 (got " + s1.pay + ")");
// the unrounded formula says 386.656 x 60 - 20,000 = 3,199.36; with interest rounded to the cent every month and the last payment
// clearing the balance (386.41) the exact total is 3,199.35
ok(s1.interest === 319935, "total interest 3,199.35 with cent rounding (got " + s1.interest + ")");
ok(s1.rows[59].pay === 38641, "last payment 386.41 (got " + s1.rows[59].pay + ")");
ok(s1.rows.length === 60 && s1.rows[59].bal === 0, "60 payments, ends at 0.00");
ok(s1.rows[0].int === 10000, "first month interest 100.00");
ok(s1.paid === 2000000 + s1.interest, "paid = loan + interest");
var lastPay = s1.rows[59].pay; ok(Math.abs(lastPay - 38666) < 100, "last payment near the others (" + lastPay + ")");
ok(MG.isoDate(s1.payoff) === "2031-01-15", "payoff date 60 months later");
var big = MG.schedule({ loan: 30000000, rate: MG.parseRate("6"), freq: "monthly", n: 360 });
ok(big.pay === 179865, "300,000 at 6% 30 y = 1,798.65");
ok(big.rows[359].bal === 0, "30 y schedule ends at 0");
// every row consistent
var okRows = true; s1.rows.forEach(function (rw) { if (rw.bb - rw.prin !== rw.bal || rw.pay !== rw.int + rw.prin) okRows = false; });
ok(okRows, "row arithmetic exact");
// zero rate
var z = MG.schedule({ loan: 100000, rate: MG.parseRate("0"), freq: "monthly", n: 12 });
ok(z.interest === 0 && z.rows[11].bal === 0 && z.pay === 8333, "0% loan");
// weekly / biweekly / semimonthly
["weekly", "biweekly", "semimonthly", "quarterly", "annual"].forEach(function (f) {
	var ppy = MG.FREQ[f].ppy, n = MG.nPayments(5, 0, ppy), s = MG.schedule({ loan: 2000000, rate: R6, freq: f, n: n });
	ok(s.rows.length === n && s.rows[n - 1].bal === 0, f + ": " + n + " payments, ends at 0");
});
ok(MG.isoDate(MG.dateAt({ y: 2026, m: 1, d: 31 }, 1, "monthly")) === "2026-02-28", "end-of-month clamp");
// extra payments
var se = MG.schedule({ loan: 2000000, rate: R6, freq: "monthly", n: 60, extra: 10000 });
ok(se.rows.length < 60 && se.interest < s1.interest && se.rows[se.rows.length - 1].bal === 0, "extra 100/month: fewer payments, less interest (" + se.rows.length + ")");
var sl = MG.schedule({ loan: 2000000, rate: R6, freq: "monthly", n: 60, lump: { amount: 500000, at: 12 } });
ok(sl.rows[11].ex === 500000 && sl.rows.length < 60, "one-time 5,000 at payment 12");
var sx = MG.schedule({ loan: 100000, rate: R6, freq: "monthly", n: 12, lump: { amount: 99999999, at: 1 } });
ok(sx.rows.length === 1 && sx.rows[0].bal === 0, "huge lump pays it off, never below 0");
// how much can I borrow
var L = MG.pv(38666, 0.005, 60);
ok(MG.pmt(L, 0.005, 60) <= 38666 && MG.pmt(L + 1, 0.005, 60) >= 38666, "pv inverse of pmt (" + L + ")");
ok(Math.abs(L - 2000000) < 50, "386.66 a month buys about 20,000");
// APR
var payments = s1.rows.map(function (x) { return x.pay; });
var a0 = MG.aprOf(payments, 2000000, 12);
near(a0.apr, 0.06, 2e-5, "APR without fees = nominal rate");
var a1 = MG.aprOf(payments, 2000000 - 50000, 12);
ok(a1.apr > 0.069 && a1.apr < 0.072, "500 fee on 20,000 / 5 y -> APR about 7.0% (" + (a1.apr * 100).toFixed(3) + ")");
// round trip: payments built from a rate are recovered by the solver
[3.5, 9.99, 24].forEach(function (p) {
	var f = p / 1200, pay = 100000 * f / (1 - Math.pow(1 + f, -36)), arr = []; for (var q = 0; q < 36; q++) arr.push(pay);
	near(MG.aprOf(arr, 100000, 12).apr * 100, p, 1e-8, "APR solver round trip " + p + "%");
});
near(MG.aprOf(payments, 1950000, 12).ear, Math.pow(1 + MG.aprOf(payments, 1950000, 12).periodic, 12) - 1, 1e-12, "EAR consistent");
ok(MG.durationText(54, 12) === "4 years 6 months", "durationText");
ok(MG.yearRows(s1).length === 5 && MG.yearRows(s1)[0].int + MG.yearRows(s1)[1].int + MG.yearRows(s1)[2].int + MG.yearRows(s1)[3].int + MG.yearRows(s1)[4].int === s1.interest, "year rollup adds up");

// chart sliders
ok(MG.niceCeil(37000) === 50000 && MG.niceCeil(120000) === 200000 && MG.niceCeil(2400) === 2500 && MG.niceCeil(1000) === 1000, "niceCeil");
(function () {
	var r = MG.sliderRange("start", 10000); ok(r.min === 0 && r.max === 50000 && r.step === 100, "start range for 10,000");
	r = MG.sliderRange("start", 400000); ok(r.max === 2000000 && r.max >= 400000, "start range grows with the typed amount");
	r = MG.sliderRange("dep", 200); ok(r.max === 1000, "deposit range 0-1,000");
	r = MG.sliderRange("rate", 5); ok(r.max === 15 && r.step === 0.05, "rate range 0-15%");
	r = MG.sliderRange("rate", 30); ok(r.max === 60, "rate range 0-60% for 30%");
	r = MG.sliderRange("rate", 90); ok(r.max === 100, "rate range capped at 100%");
	r = MG.sliderRange("years", 10); ok(r.min === 1 && r.max === 40, "years range");
	r = MG.sliderRange("years", 70); ok(r.max === 100, "years range capped at 100");
	ok(MG.snapSlider("rate", 5.0300001, MG.sliderRange("rate", 5)) === 5.05 || MG.snapSlider("rate", 5.0300001, MG.sliderRange("rate", 5)) === 5, "rate snaps to 0.05");
	ok(MG.snapSlider("rate", 7.26, MG.sliderRange("rate", 5)) === 7.25, "rate 7.26 -> 7.25");
	ok(MG.snapSlider("start", 12345, MG.sliderRange("start", 10000)) === 12300, "start snaps to 100");
	ok(MG.snapSlider("years", 99, MG.sliderRange("years", 10)) === 40, "years clamped to the range");
	["start", "dep", "rate", "years"].forEach(function (k) { [0, 1, 7.5, 333, 25000, 1e6].forEach(function (v) { var g = MG.sliderRange(k, v); ok(g.max >= Math.min(v, 100) || k === "start" || k === "dep", k + " range holds " + v); if (k === "start" || k === "dep") ok(g.max >= v, k + " range holds " + v); }); });
})();

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
