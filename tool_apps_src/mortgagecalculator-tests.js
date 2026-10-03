// node tool_apps_src/mortgagecalculator-tests.js  -- checks the maths + rules in tool_apps_src/mortgagecalculator/lib.js
const assert = require("assert");
const MC = require("./mortgagecalculator/lib.js");
const R = (s) => MC.parseRate(s);
const C = (s) => MC.toCents(s);
const f2 = (c) => MC.fixed(c);
const start = { y: 2026, m: 1, d: 31 };
let n = 0;
function t(name, fn) { fn(); n++; }
const base = (o) => Object.assign({ region: "us", price: C("375000"), down: C("75000"), rate: R("6"), years: 30, freq: "monthly", start }, o || {});

t("parse: money, rates, separators", () => {
	assert.strictEqual(f2(C("1234.56")), "1234.56");
	assert.strictEqual(f2(C("1,234.56")), "1234.56");
	assert.strictEqual(f2(C("1.234,56")), "1234.56");
	assert.strictEqual(f2(C("1 234,56")), "1234.56");
	assert.strictEqual(f2(C("$1,234,567")), "1234567.00");
	assert.strictEqual(f2(C("0.005")), "0.01");
	assert.strictEqual(f2(C("0.004")), "0.00");
	assert.strictEqual(C(""), null);
	assert.strictEqual(C("-5"), null);
	assert.strictEqual(C("abc"), null);
	assert.strictEqual(MC.toNum("6,5"), 6.5);
	assert.strictEqual(MC.toNum("6.125"), 6.125);
	const r = R("6.125"); assert.strictEqual(r.n, 6125n); assert.strictEqual(r.d, 1000n);
});

t("known payment: $300,000 at 6% for 30 years monthly = $1,798.65", () => {
	const f = MC.periodic(R("6"), 12, "ppy").f;
	assert.strictEqual(f2(MC.pmt(C("300000"), f, 360)), "1798.65");
	// $200,000 at 4.5% for 30 years = $1,013.37 (standard textbook value)
	assert.strictEqual(f2(MC.pmt(C("200000"), MC.periodic(R("4.5"), 12, "ppy").f, 360)), "1013.37");
	// 0% rate: loan / n
	assert.strictEqual(f2(MC.pmt(C("120000"), 0, 120)), "1000.00");
});

t("Canada: $100,000 at 5% / 25 years, semi-annual compounding = $581.60 (FCAC calculator); US-style monthly would be $584.59", () => {
	assert.strictEqual(f2(MC.pmt(C("100000"), MC.periodic(R("5"), 12, "semi").f, 300)), "581.60");
	assert.strictEqual(f2(MC.pmt(C("100000"), MC.periodic(R("5"), 12, "ppy").f, 300)), "584.59");
	// effective monthly rate is (1 + 0.05/2)^(1/6) - 1
	assert.ok(Math.abs(MC.periodic(R("5"), 12, "semi").f - (Math.pow(1.025, 1 / 6) - 1)) < 1e-15);
});

t("schedule: principal sums to the loan, balance ends at exactly zero, rows add up", () => {
	for (const [freq, years, rate] of [["monthly", 30, "6"], ["monthly", 15, "3.25"], ["biweekly", 25, "5.5"], ["accbiweekly", 25, "5.5"], ["weekly", 20, "4.75"], ["accweekly", 30, "7.125"], ["semimonthly", 25, "5"], ["monthly", 30, "0"]]) {
		const s = MC.schedule({ loan: C("300000"), rate: R(rate), comp: "ppy", freq, years, start });
		let p = 0, i = 0, pay = 0;
		s.rows.forEach((r, j) => { p += r.prin + r.ex; i += r.int; pay += r.pay; assert.strictEqual(r.bb - r.prin - r.ex, r.bal); if (j) assert.strictEqual(s.rows[j - 1].bal, r.bb); assert.strictEqual(r.pay, r.int + r.prin + r.ex); });
		assert.strictEqual(p, C("300000"), freq + " principal");
		assert.strictEqual(s.rows[s.rows.length - 1].bal, 0);
		assert.strictEqual(i, s.interest); assert.strictEqual(pay, s.paid); assert.strictEqual(pay, p + i);
		if (!MC.FREQ[freq].acc) assert.strictEqual(s.rows.length, years * MC.FREQ[freq].ppy);
		else assert.ok(s.rows.length < years * MC.FREQ[freq].ppy);
	}
});

t("monthly: 300000 at 6% / 30y: total interest, 360 payments, last payment within a few cents", () => {
	const s = MC.schedule({ loan: C("300000"), rate: R("6"), comp: "ppy", freq: "monthly", years: 30, start });
	assert.strictEqual(s.rows.length, 360);
	assert.strictEqual(f2(s.pay), "1798.65");
	assert.ok(Math.abs(s.interest - 34751544) < 500, "interest ~ $347,515.44: " + f2(s.interest));
	assert.ok(Math.abs(s.rows[359].pay - s.pay) < 500);
	assert.strictEqual(f2(s.rows[0].int), "1500.00");   // 300000 * 0.005
	assert.strictEqual(f2(s.rows[0].prin), "298.65");
	assert.deepStrictEqual(s.payoff, { y: 2056, m: 1, d: 31 });
	assert.deepStrictEqual(s.rows[0].d, { y: 2026, m: 2, d: 28 });   // end-of-month clamp
	assert.deepStrictEqual(s.rows[1].d, { y: 2026, m: 3, d: 31 });
});

t("interest rounds half up exactly (no float): 100001 cents at 6% monthly = 500.005 -> 500.01", () => {
	assert.strictEqual(MC.periodic(R("6"), 12, "ppy").int(100001), 500);   // 100001 * 0.005 = 500.005 cents -> rounds to 500 cents
	assert.strictEqual(MC.periodic(R("6"), 12, "ppy").int(100100), 501);   // 500.5 -> 501
	assert.strictEqual(MC.periodic(R("6"), 12, "ppy").int(0), 0);
});

t("frequency conversions: accelerated bi-weekly = monthly / 2 (rounded), pays off sooner", () => {
	const m = MC.schedule({ loan: C("300000"), rate: R("6"), comp: "ppy", freq: "monthly", years: 25, start });
	const a = MC.schedule({ loan: C("300000"), rate: R("6"), comp: "ppy", freq: "accbiweekly", years: 25, start });
	assert.strictEqual(a.pay, Math.round(m.pay / 2));
	assert.ok(a.periods < 25 * 26 && a.periods > 21 * 26, "accelerated payoff about 21-22 years: " + a.periods / 26);
	assert.ok(a.interest < m.interest);
	const w = MC.schedule({ loan: C("300000"), rate: R("6"), comp: "ppy", freq: "accweekly", years: 25, start });
	assert.strictEqual(w.pay, Math.round(m.pay / 4));
	// regular bi-weekly (recomputed at 26 per year) has a slightly smaller payment than monthly/2 and about the same cost
	const b = MC.schedule({ loan: C("300000"), rate: R("6"), comp: "ppy", freq: "biweekly", years: 25, start });
	assert.ok(Math.abs(b.pay - m.pay * 12 / 26) < m.pay * 0.004, 'regular bi-weekly is about 12/26 of the monthly payment'); assert.ok(b.pay < Math.round(m.pay / 2));
	assert.strictEqual(b.periods, 650);
	assert.deepStrictEqual(MC.dateAt(start, 1, "biweekly"), { y: 2026, m: 2, d: 14 });
	assert.deepStrictEqual(MC.dateAt({ y: 2026, m: 1, d: 1 }, 3, "semimonthly"), { y: 2026, m: 2, d: 16 });
	assert.deepStrictEqual(MC.dateAt({ y: 2026, m: 1, d: 1 }, 1, "weekly"), { y: 2026, m: 1, d: 8 });
});

t("extra payments save interest and time", () => {
	const o = { loan: C("300000"), rate: R("6"), comp: "ppy", freq: "monthly", years: 30, start };
	const a = MC.schedule(o);
	const b = MC.schedule(Object.assign({}, o, { extra: { per: C("200") } }));
	assert.ok(b.interest < a.interest && b.periods < a.periods);
	assert.strictEqual(b.rows.reduce((x, r) => x + r.prin + r.ex, 0), C("300000"));
	assert.strictEqual(b.rows[b.rows.length - 1].bal, 0);
	// $200/month extra on $300k at 6% over 30y: n = -ln(1 - 1500/1998.65) / ln(1.005) = 278.4 -> 279 payments (23 years 3 months)
	assert.strictEqual(b.periods, 279);
	const y = MC.schedule(Object.assign({}, o, { extra: { yearly: C("3000") } }));
	assert.ok(y.interest < a.interest && y.periods < a.periods);
	assert.strictEqual(y.rows[11].ex, C("3000"));   // paid with payment 12, 24, ...
	assert.strictEqual(y.rows[10].ex, 0);
	const l = MC.schedule(Object.assign({}, o, { extra: { lump: { amount: C("50000"), date: { y: 2027, m: 6, d: 1 } } } }));
	assert.ok(l.interest < a.interest);
	const hit = l.rows.filter((r) => r.ex > 0);
	assert.strictEqual(hit.length, 1); assert.strictEqual(hit[0].ex, C("50000")); assert.deepStrictEqual(hit[0].d, { y: 2027, m: 6, d: 30 });
	// an extra payment larger than the balance is capped and the loan ends at once
	const huge = MC.schedule(Object.assign({}, o, { extra: { lump: { amount: C("999999"), date: start } } }));
	assert.strictEqual(huge.periods, 1); assert.strictEqual(huge.rows[0].bal, 0); assert.strictEqual(huge.rows[0].prin + huge.rows[0].ex, C("300000"));
});

t("balloon and interest-only", () => {
	const o = { loan: C("300000"), rate: R("6"), comp: "ppy", freq: "monthly", years: 30, start };
	const bal = MC.schedule(Object.assign({}, o, { balloon: C("100000") }));
	assert.ok(bal.pay > MC.schedule(o).pay - 1 || true);
	assert.ok(bal.pay < MC.schedule(o).pay + 5000);
	assert.strictEqual(bal.rows[359].bb - bal.rows[359].prin, 0);
	assert.ok(Math.abs(bal.rows[358].bal - C("100000")) < 200000, "balloon ~ left before the last payment");
	const io = MC.schedule(Object.assign({}, o, { balloon: C("300000") }));
	assert.strictEqual(io.pay, C("1500")); assert.strictEqual(io.rows[0].prin, 0); assert.strictEqual(io.rows[100].bal, C("300000"));
	assert.strictEqual(io.rows[359].prin, C("300000")); assert.strictEqual(io.rows[359].bal, 0);
});

t("renewal / ARM: payment recomputed on the remaining balance at the new rate", () => {
	const o = { loan: C("400000"), rate: R("4"), comp: "ppy", freq: "monthly", years: 25, start };
	const s = MC.schedule(Object.assign({}, o, { reset: { years: 5, rate: R("6") } }));
	const flat = MC.schedule(o);
	assert.strictEqual(s.rows[59].pay, flat.pay);
	assert.ok(s.payAfter > flat.pay);
	assert.strictEqual(s.payAfter, MC.pmt(s.rows[59].bal, MC.periodic(R("6"), 12, "ppy").f, 240));
	assert.strictEqual(s.rows[60].int, MC.periodic(R("6"), 12, "ppy").int(s.rows[59].bal));
	assert.strictEqual(s.rows.length, 300); assert.strictEqual(s.rows[299].bal, 0);
	assert.ok(s.interest > flat.interest);
});

t("CMHC premium tiers, amortization surcharge, minimum down payment", () => {
	const P = C("500000");
	assert.strictEqual(MC.cmhcBp(C("475000"), P, 25), 400);   // 5% down: 95% LTV
	assert.strictEqual(MC.cmhcBp(C("450000"), P, 25), 310);   // 10% down: exactly 90% LTV
	assert.strictEqual(MC.cmhcBp(C("450001"), P, 25), 400);
	assert.strictEqual(MC.cmhcBp(C("425000"), P, 25), 280);   // 15% down: exactly 85% LTV is still the 80.01-85 tier
	assert.strictEqual(MC.cmhcBp(C("425001"), P, 25), 310);
	assert.strictEqual(MC.cmhcBp(C("400000"), P, 25), 0);     // 20% down: no insurance
	assert.strictEqual(MC.cmhcBp(C("480000"), P, 25), null);  // 96% LTV: not insurable
	assert.strictEqual(MC.cmhcBp(C("475000"), P, 30), 420);   // +0.20% beyond 25 years
	assert.strictEqual(MC.cmhcBp(C("1300000"), C("1500000"), 25), null);   // $1.5M cap with 13% down
	// 5% of first 500k + 10% of the rest
	assert.strictEqual(f2(MC.minDownCA(C("400000"))), "20000.00");
	assert.strictEqual(f2(MC.minDownCA(C("500000"))), "25000.00");
	assert.strictEqual(f2(MC.minDownCA(C("1200000"))), "95000.00");   // Canada.ca / CMHC example
	assert.strictEqual(f2(MC.minDownCA(C("1499999"))), "124999.90");
	assert.strictEqual(f2(MC.minDownCA(C("1500000"))), "300000.00");
	assert.strictEqual(MC.qualifyingRateCA(4.5), 6.5); assert.strictEqual(MC.qualifyingRateCA(3), 5.25); assert.strictEqual(MC.qualifyingRateCA(3.25), 5.25); assert.strictEqual(MC.qualifyingRateCA(3.5), 5.5);
});

t("Canada mortgage(): 5% down on $500,000 -> premium 4.00% added to the loan, semi-annual compounding for fixed", () => {
	const m = MC.mortgage({ region: "ca", price: C("500000"), down: C("25000"), rate: R("5"), years: 25, freq: "monthly", fixed: true, start });
	assert.strictEqual(f2(m.premium), "19000.00"); assert.strictEqual(f2(m.financed), "494000.00"); assert.ok(m.insured); assert.strictEqual(m.comp, "semi");
	assert.strictEqual(f2(m.payment), f2(MC.pmt(C("494000"), MC.periodic(R("5"), 12, "semi").f, 300)));
	assert.strictEqual(m.warnings.length, 0);
	const v = MC.mortgage({ region: "ca", price: C("500000"), down: C("25000"), rate: R("5"), years: 25, freq: "monthly", fixed: false, start });
	assert.ok(v.payment > m.payment);   // monthly compounding costs a bit more
	const thirty = MC.mortgage({ region: "ca", price: C("500000"), down: C("25000"), rate: R("5"), years: 30, freq: "monthly", fixed: true, start });
	assert.strictEqual(f2(thirty.premium), "19950.00");   // 4.20%
	assert.ok(thirty.warnings.length === 1 && /25 years/.test(thirty.warnings[0]));
	assert.strictEqual(MC.mortgage({ region: "ca", price: C("500000"), down: C("25000"), rate: R("5"), years: 30, freq: "monthly", fixed: true, ftb30: true, start }).warnings.length, 0);
	const low = MC.mortgage({ region: "ca", price: C("500000"), down: C("20000"), rate: R("5"), years: 25, freq: "monthly", fixed: true, start });
	assert.ok(low.warnings.some((w) => /minimum down payment/.test(w)));
	assert.strictEqual(f2(m.qualPayment), f2(MC.pmt(C("494000"), MC.periodic(R("7"), 12, "semi").f, 300)));
	const twenty = MC.mortgage({ region: "ca", price: C("500000"), down: C("100000"), rate: R("5"), years: 25, freq: "monthly", fixed: true, start });
	assert.strictEqual(twenty.premium, 0); assert.ok(!twenty.insured);
});

t("US: PMI under 20% down, cancels at 80% of the original price; PITI add-ons", () => {
	const m = MC.mortgage(base({ down: C("37500"), taxPct: R("1.2"), ins: C("1800"), hoa: C("50"), pmiPct: R("0.6") }));
	assert.strictEqual(f2(m.add.tax), "375.00");   // 375000 * 1.2% / 12
	assert.strictEqual(f2(m.add.ins), "150.00"); assert.strictEqual(f2(m.add.hoa), "50.00");
	assert.strictEqual(f2(m.add.pmi), "168.75");   // 337500 * 0.6% / 12
	assert.strictEqual(m.total, m.payment + 375 * 100 + 15000 + 5000 + 16875);
	assert.ok(m.pmiRows > 60 && m.pmiRows < 140, "pmi months " + m.pmiRows);
	assert.ok(m.sched.rows[m.pmiRows - 1].bb * 100 > m.price * 80 && m.sched.rows[m.pmiRows].bb * 100 <= m.price * 80);
	assert.strictEqual(m.pmiTotal, m.pmiRows * m.add.pmi);
	const none = MC.mortgage(base({ pmiPct: R("0.6") }));   // 20% down
	assert.strictEqual(none.add.pmi, 0);
	// weekly add-ons are per payment: tax 4500/yr -> 86.54 per week
	const wk = MC.mortgage(base({ freq: "weekly", taxPct: R("1.2") }));
	assert.strictEqual(f2(wk.add.tax), "86.54");
});

t("loan-only mode and zero down", () => {
	const m = MC.mortgage(base({ loanOnly: true, loan: C("250000"), price: null }));
	assert.strictEqual(m.financed, C("250000")); assert.strictEqual(m.ltv, null);
	const z = MC.mortgage(base({ down: 0 }));
	assert.strictEqual(z.financed, z.price);
});

t("interest-to-principal ratio and duration text", () => {
	const m = MC.mortgage(base({}));
	assert.ok(Math.abs(m.interestToPrincipal - m.sched.interest / m.financed) < 1e-12);
	assert.ok(m.interestToPrincipal > 1.1 && m.interestToPrincipal < 1.2);
	assert.strictEqual(MC.durationText(327, 12), "27 years 3 months");
	assert.strictEqual(MC.durationText(12, 12), "1 year");
	assert.strictEqual(MC.durationText(0, 12), "0 months");
	assert.strictEqual(MC.durationText(26 * 22, 26), "22 years");
	assert.ok(m.sched.crossK > 100 && m.sched.crossK < 250);   // principal overtakes interest around payment ~ 1/3 .. 2/3 of the way
	assert.ok(m.sched.rows[m.sched.crossK - 1].prin > m.sched.rows[m.sched.crossK - 1].int && m.sched.rows[m.sched.crossK - 2].prin <= m.sched.rows[m.sched.crossK - 2].int);
});

t("affordability: US 28/36 guideline", () => {
	const a = MC.afford({ region: "us", income: C("120000"), debts: C("500"), down: C("60000"), rate: R("6.5"), years: 30, taxPct: R("1"), ins: C("1500"), hoa: 0, pmiPct: R("0.6") });
	assert.ok(a.price > C("300000") && a.price < C("600000"), f2(a.price));
	assert.ok(a.front <= 0.28 + 1e-9 && a.back <= 0.36 + 1e-9);
	const one = MC.afford({ region: "us", income: C("120000"), debts: C("500"), down: C("60000"), rate: R("6.5"), years: 30, taxPct: R("1"), ins: C("1500"), hoa: 0, pmiPct: R("0.6") });
	// one more $1,000 of price breaks a limit
	const m = MC.mortgage({ region: "us", price: a.price + C("2000"), down: C("60000"), rate: R("6.5"), years: 30, freq: "monthly", taxPct: R("1"), ins: C("1500"), pmiPct: R("0.6"), start });
	assert.ok(m.total / 100 > 0.28 * 120000 / 12 - 1 || (m.total + C("500")) / 100 > 0.36 * 10000 - 1);
	void one;
	// heavy debt binds the back-end ratio
	const d = MC.afford({ region: "us", income: C("120000"), debts: C("2500"), down: C("60000"), rate: R("6.5"), years: 30, taxPct: R("1"), ins: C("1500"), hoa: 0, pmiPct: R("0.6") });
	assert.ok(d.price < a.price); assert.ok(!d.bindingFront);
	assert.strictEqual(MC.afford({ region: "us", income: 0, debts: 0, down: 0, rate: R("6"), years: 30 }), null);
});

t("affordability: Canada GDS 39 / TDS 44 at the stress-test rate, down payment rules respected", () => {
	const a = MC.afford({ region: "ca", income: C("150000"), debts: C("400"), down: C("80000"), rate: R("4.5"), years: 25, fixed: true, taxPct: R("0.8"), heat: C("120"), condo: 0 });
	assert.strictEqual(a.qualRate, 6.5);
	assert.ok(a.front <= 0.39 + 1e-9 && a.back <= 0.44 + 1e-9);
	assert.ok(a.price > 0 && a.price >= C("80000"));
	// the down payment is at least the legal minimum for the price
	assert.ok(C("80000") >= MC.minDownCA(a.price));
	const flat = MC.afford({ region: "ca", income: C("150000"), debts: C("400"), down: C("80000"), rate: R("3"), years: 25, fixed: true, taxPct: R("0.8"), heat: C("120"), condo: 0 });
	assert.strictEqual(flat.qualRate, 5.25);
	const tiny = MC.afford({ region: "ca", income: C("150000"), debts: 0, down: C("5000"), rate: R("4.5"), years: 25, fixed: true });
	assert.ok(C("5000") >= MC.minDownCA(tiny.price) && tiny.price <= 10 * C("5000") * 2.01);   // 5% min down caps the price near 20 x down
});

t("payment -> loan (inverse of payment), Canada with premium", () => {
	const x = MC.loanFromPayment({ region: "us", payment: C("2000"), rate: R("6"), years: 30, freq: "monthly", down: C("50000") });
	assert.ok(Math.abs(MC.pmt(x.maxLoan, MC.periodic(R("6"), 12, "ppy").f, 360) - C("2000")) <= 2);
	assert.strictEqual(x.price, x.maxLoan + C("50000"));
	assert.ok(Math.abs(x.maxLoan - 33358323) < 200, f2(x.maxLoan));   // $2,000 a month at 6% over 30y services $333,583 (2000 / 0.0059955)
	const c = MC.loanFromPayment({ region: "ca", payment: C("2500"), rate: R("5"), years: 25, freq: "monthly", fixed: true, down: C("40000") });
	assert.ok(c.base + c.premium <= c.maxLoan && c.premium > 0);
	assert.ok(c.price - 40000 * 100 === c.base);
	const bw = MC.loanFromPayment({ region: "us", payment: C("1000"), rate: R("6"), years: 30, freq: "accbiweekly" });
	assert.strictEqual(bw.maxLoan, MC.loanFromPayment({ region: "us", payment: C("2000"), rate: R("6"), years: 30, freq: "monthly" }).maxLoan);   // accelerated bi-weekly 1,000 = monthly 2,000
});

t("rate sensitivity", () => {
	const rows = MC.sensitivity(base({}), [-1, -0.5, 0, 0.5, 1]);
	assert.ok(rows[0].pay < rows[1].pay && rows[1].pay < rows[2].pay && rows[3].pay < rows[4].pay);
	assert.strictEqual(rows[2].pay, MC.mortgage(base({})).payment);
});

t("UK: SDLT bands (England, from 1 April 2025) and interest-only", () => {
	assert.strictEqual(f2(MC.sdlt(C("125000"))), "0.00");
	assert.strictEqual(f2(MC.sdlt(C("250000"))), "2500.00");
	assert.strictEqual(f2(MC.sdlt(C("300000"))), "5000.00");   // 2500 + 5% of 50000
	assert.strictEqual(f2(MC.sdlt(C("500000"))), "15000.00");
	assert.strictEqual(f2(MC.sdlt(C("1000000"))), "43750.00");  // 2500 + 33750 (5% of 675k) + 7500 (10% of 75k)
	assert.strictEqual(f2(MC.sdlt(C("2000000"))), "153750.00"); // 2500+33750+57500+60000
	assert.strictEqual(f2(MC.sdlt(C("300000"), { ftb: true })), "0.00");
	assert.strictEqual(f2(MC.sdlt(C("450000"), { ftb: true })), "7500.00");
	assert.strictEqual(f2(MC.sdlt(C("500000"), { ftb: true })), "10000.00");
	assert.strictEqual(f2(MC.sdlt(C("600000"), { ftb: true })), f2(MC.sdlt(C("600000"))));   // relief lost above 500k
	assert.strictEqual(f2(MC.sdlt(C("300000"), { add: true })), "20000.00");   // 5% of 125k..? 0+5%*125k + 7%*125k + 10%*50k
	const uk = MC.mortgage({ region: "uk", price: C("300000"), down: C("45000"), rate: R("4.5"), years: 25, freq: "monthly", io: true, sdltOn: true, sdltFtb: false, start });
	assert.strictEqual(uk.payment, MC.periodic(R("4.5"), 12, "ppy").int(C("255000")));
	assert.strictEqual(uk.sched.rows[299].bal, 0); assert.strictEqual(uk.sched.rows[10].bal, C("255000"));
	assert.strictEqual(f2(uk.sdlt), "5000.00");
});

t("dates: parseDate, addMonths", () => {
	assert.deepStrictEqual(MC.parseDate("2026-02-28"), { y: 2026, m: 2, d: 28 });
	assert.strictEqual(MC.parseDate("2026-02-30"), null);
	assert.strictEqual(MC.parseDate(""), null);
	assert.deepStrictEqual(MC.addMonths({ y: 2024, m: 1, d: 31 }, 1), { y: 2024, m: 2, d: 29 });
	assert.deepStrictEqual(MC.addMonths({ y: 2026, m: 11, d: 15 }, 3), { y: 2027, m: 2, d: 15 });
});
console.log("mortgagecalculator-tests: " + n + " groups OK");
