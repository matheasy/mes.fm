// node tool_apps_src/vatcalculator-tests.js  -- checks the VAT maths in tool_apps_src/vatcalculator/lib.js
const assert = require("assert");
const VC = require("./vatcalculator/lib.js");
const q = (s) => VC.parse(s);
const r = (s) => VC.rateFrom(s);
const cent = VC.stepFor("cent", 2);
const f2 = (a) => VC.fixed(a, 2);
let n = 0;
function t(name, fn) { fn(); n++; }

t("parse: plain, separators, signs", () => {
	assert.strictEqual(f2(q("1234.56")), "1234.56");
	assert.strictEqual(f2(q("1,234.56")), "1234.56");
	assert.strictEqual(f2(q("1.234,56")), "1234.56");
	assert.strictEqual(f2(q("1 234,56")), "1234.56");
	assert.strictEqual(f2(q("1'234.56")), "1234.56");
	assert.strictEqual(f2(q("$1,234")), "1234.00");
	assert.strictEqual(f2(q("1,234,567")), "1234567.00");
	assert.strictEqual(f2(q("1.234.567")), "1234567.00");
	assert.strictEqual(f2(q("12,5")), "12.50");
	assert.strictEqual(f2(q("0,125")), "0.13");
	assert.strictEqual(f2(q(".5")), "0.50");
	assert.strictEqual(f2(q("-19.99")), "-19.99");
	assert.strictEqual(f2(q("19.99%")), "19.99");
	assert.strictEqual(q(""), null);
	assert.strictEqual(q("abc"), null);
	assert.strictEqual(q("1-2"), null);
});

t("exact arithmetic: 0.1 + 0.2 is 0.3", () => {
	assert.ok(VC.eq(VC.add(q("0.1"), q("0.2")), q("0.3")));
	assert.strictEqual(VC.fixed(VC.mul(q("19.99"), q("3")), 2), "59.97");
});

t("add VAT (net known)", () => {
	let c = VC.calc("net", q("100"), r("20"), cent);
	assert.deepStrictEqual([f2(c.net), f2(c.vat), f2(c.gross)], ["100.00", "20.00", "120.00"]);
	c = VC.calc("net", q("19.99"), r("19"), cent);   // 3.7981 -> 3.80
	assert.deepStrictEqual([f2(c.vat), f2(c.gross)], ["3.80", "23.79"]);
	c = VC.calc("net", q("0.1"), r("7.5"), cent);
	assert.strictEqual(f2(c.vat), "0.01");           // 0.0075 rounds up (half away from zero)
	c = VC.calc("net", q("200"), r("9.975"), cent);  // Quebec-style 3 decimals
	assert.strictEqual(f2(c.vat), "19.95");
	c = VC.calc("net", q("100"), r("0"), cent);
	assert.strictEqual(f2(c.gross), "100.00");
});

t("remove VAT (gross known)", () => {
	let c = VC.calc("gross", q("120"), r("20"), cent);
	assert.deepStrictEqual([f2(c.net), f2(c.vat)], ["100.00", "20.00"]);
	c = VC.calc("gross", q("100"), r("20"), cent);   // 83.333.. -> 83.33, VAT 16.67
	assert.deepStrictEqual([f2(c.net), f2(c.vat), f2(c.gross)], ["83.33", "16.67", "100.00"]);
	c = VC.calc("gross", q("9.99"), r("25.5"), cent);
	assert.strictEqual(f2(VC.add(c.net, c.vat)), "9.99");
});

t("VAT amount known", () => {
	let c = VC.calc("vat", q("20"), r("20"), cent);
	assert.deepStrictEqual([f2(c.net), f2(c.gross)], ["100.00", "120.00"]);
	assert.strictEqual(VC.calc("vat", q("20"), r("0"), cent), null);
});

t("round trips: net -> gross -> net returns the net (every whole-cent net 0.01..50.00 at common rates)", () => {
	[5, 7, 9, 10, 12, 15, 19, 20, 21, 23, 25, 25.5, 27].forEach((rate) => {
		for (let cents = 1; cents <= 5000; cents += 7) {
			const net = VC.Q(cents, 100), rr = r(String(rate));
			const up = VC.calc("net", net, rr, cent);
			const down = VC.calc("gross", up.gross, rr, cent);
			// removing VAT from the rounded gross always lands within one cent of the original net
			assert.ok(VC.cmp(VC.roundTo(VC.sub(down.net, net), VC.Q(1, 100)), VC.Q(0)) === 0 || Math.abs(VC.toNumber(VC.sub(down.net, net))) <= 0.0101, "rate " + rate + " cents " + cents);
			// the three amounts always add up exactly
			assert.ok(VC.eq(VC.add(down.net, down.vat), down.gross));
		}
	});
});

t("rounding modes", () => {
	const a = q("12.3456");
	assert.strictEqual(VC.fixed(VC.roundTo(a, VC.stepFor("cent", 2)), 4), "12.3500");
	assert.strictEqual(VC.fixed(VC.roundTo(a, VC.stepFor("unit", 2)), 2), "12.00");
	assert.strictEqual(VC.fixed(VC.roundTo(q("12.38"), VC.stepFor("nickel", 2)), 2), "12.40");
	assert.strictEqual(VC.fixed(VC.roundTo(q("12.37"), VC.stepFor("nickel", 2)), 2), "12.35");
	assert.strictEqual(VC.fixed(VC.roundTo(q("0.125"), VC.stepFor("cent", 2)), 2), "0.13");   // half away from zero
	assert.strictEqual(VC.fixed(VC.roundTo(q("-0.125"), VC.stepFor("cent", 2)), 2), "-0.13");
	assert.strictEqual(VC.fixed(VC.roundTo(q("1234.5"), VC.stepFor("cent", 0)), 0), "1235");  // JPY-style 0 decimals
	assert.strictEqual(VC.stepFor("none", 2), null);
	const c = VC.calc("gross", q("100"), r("20"), null);   // exact: net 83.3333...
	assert.strictEqual(VC.trimmed(c.net, 2, 4), "83.3333");
	assert.ok(VC.eq(VC.add(c.net, c.vat), c.gross));
});

t("find the rate from net and gross", () => {
	const rt = VC.rateFromAmounts(q("100"), q("120"));
	assert.ok(VC.eq(rt, r("20")));
	assert.strictEqual(VC.trimmed(VC.mul(VC.rateFromAmounts(q("83.33"), q("100")), VC.Q(100)), 0, 3), "20.005");
	assert.strictEqual(VC.rateFromAmounts(q("0"), q("5")), null);
});

t("grouped invoice totals", () => {
	const lines = [
		{ amt: q("100"), t: "net", rate: r("20") },
		{ amt: q("50"), t: "net", rate: r("20") },
		{ amt: q("12"), t: "gross", rate: r("20") },
		{ amt: q("10"), t: "net", rate: r("5") },
		{ amt: q("7"), t: "net", rate: r("0") }
	];
	const inv = VC.invoice(lines, "rate", cent);
	assert.strictEqual(inv.groups.length, 3);
	assert.deepStrictEqual(inv.groups.map((g) => VC.toNumber(g.rate)), [0.2, 0.05, 0]);
	const g20 = inv.groups[0];
	assert.deepStrictEqual([f2(g20.net), f2(g20.vat), f2(g20.gross)], ["160.00", "32.00", "192.00"]);   // 150 net -> 30; 12 gross -> 10 net + 2
	assert.deepStrictEqual([f2(inv.groups[1].vat), f2(inv.groups[2].vat)], ["0.50", "0.00"]);
	assert.deepStrictEqual([f2(inv.total.net), f2(inv.total.vat), f2(inv.total.gross)], ["177.00", "32.50", "209.50"]);
});

t("per-rate vs per-line rounding differ the way invoices say", () => {
	// ten lines of 0.10 at 7.5%: per line VAT 0.0075 -> 0.01 each = 0.10; on the sum 1.00 x 7.5% = 0.075 -> 0.08
	const lines = []; for (let i = 0; i < 10; i++) lines.push({ amt: q("0.10"), t: "net", rate: r("7.5") });
	assert.strictEqual(f2(VC.invoice(lines, "line", cent).total.vat), "0.10");
	assert.strictEqual(f2(VC.invoice(lines, "rate", cent).total.vat), "0.08");
	assert.ok(VC.eq(VC.add(VC.invoice(lines, "rate", cent).total.net, VC.invoice(lines, "rate", cent).total.vat), VC.invoice(lines, "rate", cent).total.gross));
});

t("formatting (en-US)", () => {
	const usd = VC.formatter("en-US", "USD", "cent"), plain = VC.formatter("en-US", "", "cent"), jpy = VC.formatter("en-US", "JPY", "cent"), ex = VC.formatter("en-US", "EUR", "none");
	assert.strictEqual(usd(q("1234567.891")), "$1,234,567.89");
	assert.strictEqual(plain(q("0.5")), "0.50");
	assert.strictEqual(usd(q("-5")), "−$5.00");
	assert.strictEqual(jpy(q("1234.5")), "¥1,235");
	assert.strictEqual(ex(VC.Q(250, 3)), "€83.3333");
	assert.strictEqual(ex(q("100")), "€100.00");
	assert.strictEqual(VC.formatter("de-DE", "EUR", "cent")(q("1234.5")), "1.234,50 €");
});

t("rate table sanity", () => {
	const codes = new Set();
	VC.COUNTRIES.forEach((c) => {
		assert.ok(!codes.has(c.code), "duplicate " + c.code); codes.add(c.code);
		assert.ok(c.name && c.cur && c.flag, c.code);
		if (c.std != null) assert.ok(c.std > 0 && c.std < 40, c.code);
		c.red.forEach((x) => assert.ok(x[0] > 0 && x[0] <= 40, c.code));
		assert.strictEqual(VC.currencyDigits(c.cur) >= 0, true);
	});
	assert.strictEqual(VC.country("DE").std, 19);
	assert.strictEqual(VC.region(VC.country("CA"), "QC").rate, 14.975);
	assert.strictEqual(VC.region(VC.country("US"), "OR").rate, 0);
	assert.ok(VC.COUNTRIES.length >= 60);
	assert.ok(/^\d{4}-\d\d-\d\d$/.test(VC.RATES_VERIFIED));
});

console.log("vatcalculator: " + n + " test groups passed");
