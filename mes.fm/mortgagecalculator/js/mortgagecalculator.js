/* MES Mortgage Calculator 2.0 -- the maths and the rules tables (global `MC`, also require()-able in node: tool_apps_src/mortgagecalculator-tests.js).
 * Money is whole CENTS (integers, JS Numbers are exact far past any mortgage). Rates are parsed from the typed decimal STRING into an exact
 * rational (BigInt), so for the usual "nominal annual rate / payments per year" the interest on every payment is computed with exact integer
 * arithmetic (round half up, per payment, like a lender). Only the Canadian semi-annual compounding of a fixed rate needs a root, so that one
 * periodic rate is a double (interest is then rounded to the cent every payment, so nothing accumulates). The payment itself comes from the
 * annuity formula and is rounded to the cent; the final payment clears whatever is left (so the schedule always ends at exactly 0.00).
 * Rules tables (RULES_VERIFIED, CMHC premiums, minimum down payment, stress test, SDLT) are at the top: update them there. */
(function (root) {
	"use strict";
	var RULES_VERIFIED = "2026-10-03";
	var SOURCES = [
		["CMHC premium table", "https://www.cmhc-schl.gc.ca/professionals/project-funding-and-mortgage-financing/mortgage-loan-insurance/mortgage-loan-insurance-homeownership-programs/premium-information-for-homeowner-and-small-rental-loans"],
		["Canada.ca: 2024 mortgage reforms ($1.5M cap, 30-year amortization)", "https://www.canada.ca/en/department-finance/news/2024/12/boldest-mortgage-reforms-in-decades-come-into-force-today.html"],
		["OSFI minimum qualifying rate", "https://www.osfi-bsif.gc.ca/Eng/fi-if/in-ai/Pages/mqr-nfo.aspx"],
		["FCAC mortgage calculator (Canadian compounding check)", "https://itools-ioutils.fcac-acfc.gc.ca/MC-CH/MCReport-CHSommaire-eng.aspx"],
		["GOV.UK: Stamp Duty Land Tax residential rates", "https://www.gov.uk/stamp-duty-land-tax/residential-property-rates"],
		["FHFA 2026 conforming loan limits", "https://www.fhfa.gov/news/news-release/fhfa-announces-conforming-loan-limit-values-for-2026"],
		["CFPB: when PMI can be removed", "https://www.consumerfinance.gov/ask-cfpb/when-can-i-remove-private-mortgage-insurance-pmi-from-my-loan-en-202/"]
	];
	var CONFORMING_2026 = 83275000;   // $832,750 (cents): FHFA baseline one-unit limit for 2026 (high-cost areas up to $1,249,125)

	/* ------------------------------------------------------------------ payment frequencies */
	var FREQ = {
		monthly: { ppy: 12, label: "Monthly", per: "month" },
		semimonthly: { ppy: 24, label: "Semi-monthly (twice a month)", per: "payment" },
		biweekly: { ppy: 26, label: "Bi-weekly (every 2 weeks)", per: "2 weeks" },
		accbiweekly: { ppy: 26, acc: 2, label: "Accelerated bi-weekly", per: "2 weeks" },
		weekly: { ppy: 52, label: "Weekly", per: "week" },
		accweekly: { ppy: 52, acc: 4, label: "Accelerated weekly", per: "week" }
	};
	var FREQ_ORDER = ["monthly", "semimonthly", "biweekly", "accbiweekly", "weekly", "accweekly"];

	/* ------------------------------------------------------------------ region presets (typical example numbers, not advice) */
	var REGIONS = {
		us: { name: "United States", cur: "USD", price: "450000", dp: "20", rate: "6.5", years: "30", tax: "1", ins: "1500", hoa: "0", pmi: "0.6" },
		ca: { name: "Canada", cur: "CAD", price: "650000", dp: "10", rate: "4.5", years: "25", tax: "0.8", ins: "1200", hoa: "0", pmi: "0.6", ry: "5" },
		uk: { name: "United Kingdom", cur: "GBP", price: "300000", dp: "15", rate: "4.5", years: "25", tax: "0", ins: "0", hoa: "0", pmi: "0.6" },
		au: { name: "Australia", cur: "AUD", price: "750000", dp: "20", rate: "6", years: "30", tax: "0", ins: "0", hoa: "0", pmi: "0.6" },
		other: { name: "Other / generic", cur: "", price: "300000", dp: "20", rate: "5", years: "25", tax: "0", ins: "0", hoa: "0", pmi: "0.6" }
	};
	var CURRENCIES = [["USD", "US dollar"], ["CAD", "Canadian dollar"], ["GBP", "British pound"], ["AUD", "Australian dollar"], ["NZD", "New Zealand dollar"], ["EUR", "Euro"],
		["CHF", "Swiss franc"], ["SGD", "Singapore dollar"], ["INR", "Indian rupee"], ["ZAR", "South African rand"]];

	/* ------------------------------------------------------------------ number parsing (1,234.56 / 1.234,56 / 1 234,56) */
	function parseDec(str) {
		if (str == null) return null;
		var s = String(str).trim().replace(/[\s  '’_]/g, "").replace(/[^\d.,+\-−]/g, "").replace(/−/g, "-");
		if (!s) return null;
		var neg = false;
		if (s[0] === "-") { neg = true; s = s.slice(1); } else if (s[0] === "+") s = s.slice(1);
		if (!s || /[+\-]/.test(s)) return null;
		var lastDot = s.lastIndexOf("."), lastCom = s.lastIndexOf(","), dec = -1;
		var dots = (s.match(/\./g) || []).length, coms = (s.match(/,/g) || []).length;
		if (dots && coms) dec = Math.max(lastDot, lastCom);
		else if (dots) dec = dots === 1 ? lastDot : -1;
		else if (coms) {
			if (coms > 1) dec = -1;
			else { var after = s.length - lastCom - 1, before = s.slice(0, lastCom); dec = (after === 3 && before !== "" && before !== "0") ? -1 : lastCom; }
		}
		var ip, fp = "";
		if (dec >= 0) { ip = s.slice(0, dec).replace(/[.,]/g, ""); fp = s.slice(dec + 1); if (/[.,]/.test(fp)) return null; }
		else ip = s.replace(/[.,]/g, "");
		if (!/^\d*$/.test(ip) || !/^\d*$/.test(fp) || (ip === "" && fp === "")) return null;
		return { neg: neg, ip: ip.replace(/^0+(?=\d)/, ""), fp: fp };
	}
	function toNum(str) { var d = parseDec(str); return d ? Number((d.neg ? "-" : "") + (d.ip || "0") + "." + (d.fp || "0")) : null; }
	// typed money -> integer cents (half up), null if blank / negative / nonsense
	function toCents(str) {
		var d = parseDec(str); if (!d || d.neg) return null;
		var f = (d.fp + "000").slice(0, 3), c = BigInt(d.ip || "0") * 100n + BigInt(f.slice(0, 2));
		if (f.charAt(2) >= "5") c += 1n;
		var n = Number(c); return isFinite(n) ? n : null;
	}
	// typed percentage -> {n, d (BigInt), f (double, percent)}: exact rational n/d percent
	function parseRate(str) {
		var d = parseDec(str); if (!d || d.neg) return null;
		var digits = (d.ip || "0") + d.fp;
		return { n: BigInt(digits), d: 10n ** BigInt(d.fp.length), f: Number((d.ip || "0") + "." + (d.fp || "0")) };
	}
	function rateOf(num) { return parseRate(String(Math.round(num * 1e6) / 1e6)); }   // a double percent (qualifying rate ...) -> rate object
	function fixed(c, dp) {   // cents -> "1234.56" (locale neutral)
		var neg = c < 0; c = Math.abs(Math.round(c));
		var s = String(Math.floor(c / 100)) + "." + ("0" + (c % 100)).slice(-2);
		return (neg ? "-" : "") + (dp === 0 ? s.split(".")[0] : s);
	}

	/* ------------------------------------------------------------------ periodic rate + payment */
	// comp: "ppy" = nominal annual rate / payments per year (US, UK, Australia, Canadian variable); "semi" = nominal rate compounded
	// semi-annually (Canadian fixed: Interest Act s.6) converted to the payment period.
	function periodic(rp, ppy, comp) {
		if (!rp || rp.n === 0n) return { f: 0, int: function () { return 0; } };
		if (comp === "semi") {
			var f = Math.expm1(Math.log1p(rp.f / 200) * 2 / ppy);
			return { f: f, int: function (b) { return Math.round(b * f); } };
		}
		var den = rp.d * 100n * BigInt(ppy), num = rp.n;
		return { f: Number(num) / Number(den), int: function (b) { return Number((BigInt(b) * num * 2n + den) / (2n * den)); } };
	}
	// level payment (cents) clearing loan L over n periods at periodic rate f, leaving a balloon B at the end
	function pmt(L, f, n, B) {
		B = B || 0;
		if (n <= 0) return L;
		if (L <= 0) return 0;
		if (f === 0) return Math.max(0, Math.round((L - B) / n));
		var g = Math.log1p(f) * n, v = Math.exp(-g);
		return Math.max(0, Math.round((L - B * v) * f / (-Math.expm1(-g))));
	}
	// the loan a payment can service over n periods (inverse of pmt, no balloon)
	function pv(P, f, n) {
		if (f === 0) return P * n;
		var g = Math.log1p(f) * n;
		return Math.round(P * (-Math.expm1(-g)) / f);
	}

	/* ------------------------------------------------------------------ dates */
	function dim(y, m0) { return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate(); }
	function addMonths(s, k) { var m0 = s.m - 1 + k, y = s.y + Math.floor(m0 / 12), mm = ((m0 % 12) + 12) % 12; return { y: y, m: mm + 1, d: Math.min(s.d, dim(y, mm)) }; }
	function addDays(s, k) { var t = new Date(Date.UTC(s.y, s.m - 1, s.d + k)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
	function dateAt(s, k, freq) {
		var ppy = FREQ[freq].ppy;
		if (ppy === 12) return addMonths(s, k);
		if (ppy === 24) { var b = addMonths(s, Math.floor(k / 2)); return k % 2 ? addDays(b, 15) : b; }
		return addDays(s, (ppy === 26 ? 14 : 7) * k);
	}
	function ymd(d) { return d.y * 10000 + d.m * 100 + d.d; }
	function parseDate(str) {   // "2026-10-03" -> {y,m,d}
		var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(str || "").trim());
		if (!m) return null;
		var y = +m[1], mo = +m[2], d = +m[3];
		if (mo < 1 || mo > 12 || d < 1 || d > dim(y, mo - 1)) return null;
		return { y: y, m: mo, d: d };
	}

	/* ------------------------------------------------------------------ the amortization schedule */
	// o: { loan (cents), rate (parsed rate), comp, freq, years, balloon, start {y,m,d},
	//      reset: {years, rate (parsed)} | null, extra: {per (cents per payment), yearly (cents), lump {amount, date {y,m,d}} | null} }
	function schedule(o) {
		var F = FREQ[o.freq] || FREQ.monthly, ppy = F.ppy, comp = o.comp || "ppy";
		var L = o.loan, years = o.years, n = Math.round(years * ppy);
		var balloon = Math.min(o.balloon || 0, L);
		var per = periodic(o.rate, ppy, comp), pay;
		function accPay(bal, rate, yrs) {   // accelerated: the MONTHLY payment (same compounding) divided by 2 or 4
			var pm = periodic(rate, 12, comp);
			return Math.round(pmt(bal, pm.f, Math.round(yrs * 12), Math.min(balloon, bal)) / F.acc);
		}
		pay = F.acc ? accPay(L, o.rate, years) : pmt(L, per.f, n, balloon);
		var firstPay = pay, payAfter = null;
		var resetK = o.reset ? Math.round(o.reset.years * ppy) : -1;
		var ex = o.extra || {}, lump = ex.lump, lumpYmd = lump && lump.date ? ymd(lump.date) : 0, lumpDone = false;
		var rows = [], bal = L, crossK = 0;
		for (var k = 1; k <= n && bal > 0; k++) {
			if (resetK >= 1 && k === resetK + 1) {
				per = periodic(o.reset.rate, ppy, comp);
				pay = F.acc ? accPay(bal, o.reset.rate, years - o.reset.years) : pmt(bal, per.f, n - resetK, Math.min(balloon, bal));
				payAfter = pay;
			}
			var d = dateAt(o.start, k, o.freq), bb = bal, intr = per.int(bal), prin, extra = 0, paid;
			if (k === n || bb + intr <= pay) { prin = bb; paid = bb + intr; }
			else {
				prin = Math.max(0, pay - intr);
				extra = (ex.per || 0) + ((ex.yearly && k % ppy === 0) ? ex.yearly : 0);
				if (lump && !lumpDone && lump.amount > 0 && ymd(d) >= lumpYmd) { extra += lump.amount; lumpDone = true; }
				if (prin + extra > bb) extra = bb - prin;
				if (extra < 0) extra = 0;
				paid = intr + prin + extra;
				if (prin + extra >= bb) { prin = bb - extra; }
			}
			bal = bb - prin - extra;
			if (!crossK && prin > intr) crossK = k;
			rows.push({ k: k, d: d, bb: bb, pay: paid, int: intr, prin: prin, ex: extra, bal: bal });
		}
		var interest = 0, paidTotal = 0, i;
		for (i = 0; i < rows.length; i++) { interest += rows[i].int; paidTotal += rows[i].pay; }
		return { rows: rows, pay: firstPay, payAfter: payAfter, ppy: ppy, interest: interest, paid: paidTotal, periods: rows.length,
			payoff: rows.length ? rows[rows.length - 1].d : o.start, loan: L, crossK: crossK, n: n, freq: o.freq };
	}
	function balanceAt(s, k) {   // balance after k payments
		if (k <= 0) return s.loan;
		if (k >= s.rows.length) return 0;
		return s.rows[k - 1].bal;
	}
	function duration(periods, ppy) {   // {y, m}
		var months = Math.round(periods / ppy * 12);
		return { y: Math.floor(months / 12), m: months % 12 };
	}
	function durationText(periods, ppy) {
		var t = duration(periods, ppy), a = [];
		if (t.y) a.push(t.y + (t.y === 1 ? " year" : " years"));
		if (t.m) a.push(t.m + (t.m === 1 ? " month" : " months"));
		return a.join(" ") || "0 months";
	}

	/* ------------------------------------------------------------------ Canada: CMHC premium, minimum down payment, stress test */
	// Minimum down payment (cents): 5% of the first $500,000 + 10% of the part from $500,000 to $1.5M; 20% at $1.5M and above (insured-mortgage price cap).
	function minDownCA(price) {
		if (price >= 150000000) return Math.round(price * 0.2);
		if (price <= 50000000) return Math.round(price * 0.05);
		return 2500000 + Math.round((price - 50000000) * 0.1);
	}
	// CMHC premium rate in basis points on the BASE loan (before the premium), by loan-to-value; +20 bp when the amortization is over 25 years.
	// null = not insurable (LTV above 95%, or price at/over the $1.5M cap with under 20% down)
	function cmhcBp(base, price, years) {
		if (!price || base * 100 <= price * 80) return 0;
		if (price >= 150000000) return null;
		var bp;
		if (base * 100 <= price * 85) bp = 280; else if (base * 100 <= price * 90) bp = 310; else if (base * 100 <= price * 95) bp = 400; else return null;
		return bp + (years > 25 ? 20 : 0);
	}
	function qualifyingRateCA(ratePct) { return Math.max(ratePct + 2, 5.25); }

	/* ------------------------------------------------------------------ UK: Stamp Duty Land Tax (England and Northern Ireland, from 1 April 2025) */
	var SDLT_STD = [[12500000, 0], [25000000, 2], [92500000, 5], [150000000, 10], [Infinity, 12]];
	var SDLT_FTB = [[30000000, 0], [50000000, 5]];
	function sdlt(price, opt) {
		opt = opt || {};
		var bands = SDLT_STD, add = opt.add ? 5 : 0;
		if (opt.ftb && !opt.add && price <= 50000000) bands = SDLT_FTB;
		var lo = 0, tax = 0;
		for (var i = 0; i < bands.length && price > lo; i++) {
			var hi = Math.min(price, bands[i][0]);
			tax += (hi - lo) * (bands[i][1] + add) / 100;
			lo = bands[i][0];
		}
		return Math.round(tax);
	}

	/* ------------------------------------------------------------------ the whole case */
	function nowYmd() { var t = new Date(); return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() }; }
	// inp: { region, price (cents|null), down (cents), loan (cents), loanOnly, rate (parsed rate), years, freq, fixed (bool: Canadian fixed = semi-annual),
	//        balloon, io, taxPct (parsed|null), ins (cents/yr), hoa (cents/mo), pmiPct (parsed|null), ftb30, start, reset, extra }
	function mortgage(inp) {
		var region = inp.region || "us", F = FREQ[inp.freq] || FREQ.monthly, ppy = F.ppy, warn = [];
		var price = inp.price || 0, base, down;
		if (inp.loanOnly) { base = inp.loan || 0; down = price ? Math.max(0, price - base) : 0; }
		else { down = Math.min(inp.down || 0, price); base = Math.max(0, price - down); }
		var bp = 0, premium = 0, insured = false;
		if (region === "ca" && price) {
			bp = cmhcBp(base, price, inp.years);
			if (bp === null) {
				if (price >= 150000000 && base * 100 > price * 80) warn.push("A home priced at $1.5 million or more needs at least 20% down: it cannot get insured (high-ratio) financing.");
				else warn.push("Insured mortgages are limited to a 95% loan-to-value (5% minimum down payment).");
				bp = 0;
			} else if (bp > 0) { premium = Math.round(base * bp / 10000); insured = true; }
			var md = minDownCA(price);
			if (!inp.loanOnly && down < md) warn.push("The minimum down payment for this price is {{" + md + "}} (5% of the first $500,000 plus 10% of the rest up to $1.5 million, 20% from $1.5 million).");
			if (insured) {
				var maxAm = inp.ftb30 ? 30 : 25;
				if (inp.years > maxAm) warn.push("Insured mortgages are limited to " + maxAm + " years of amortization" + (inp.ftb30 ? "" : " (30 years for first-time buyers and buyers of new builds: tick the box)") + ".");
			}
		}
		var financed = base + premium;
		var comp = region === "ca" && inp.fixed ? "semi" : "ppy";
		var balloon = inp.io ? financed : Math.min(inp.balloon || 0, financed);
		var o = { loan: financed, rate: inp.rate, comp: comp, freq: inp.freq, years: inp.years, balloon: balloon, start: inp.start || nowYmd(), reset: inp.reset || null, extra: inp.extra || {} };
		var sched = schedule(o);
		var hasExtra = !!(o.extra.per || o.extra.yearly || (o.extra.lump && o.extra.lump.amount));
		var plain = hasExtra ? schedule({ loan: financed, rate: inp.rate, comp: comp, freq: inp.freq, years: inp.years, balloon: balloon, start: o.start, reset: o.reset, extra: {} }) : sched;
		// add-ons per payment
		var add = { tax: 0, ins: 0, hoa: 0, pmi: 0 };
		if (price && inp.taxPct) add.tax = Math.round(price * Number(inp.taxPct.n) / Number(inp.taxPct.d) / 100 / ppy);
		add.ins = Math.round((inp.ins || 0) / ppy);
		add.hoa = Math.round((inp.hoa || 0) * 12 / ppy);
		var pmiRows = 0, pmiTotal = 0, pmiCancel = null;
		if (region === "us" && price && base * 100 > price * 80 && inp.pmiPct && inp.pmiPct.n > 0n) {
			add.pmi = Math.round(base * Number(inp.pmiPct.n) / Number(inp.pmiPct.d) / 100 / ppy);
			for (var i = 0; i < sched.rows.length; i++) {
				if (sched.rows[i].bb * 100 > price * 80) pmiRows++; else { pmiCancel = sched.rows[i].d; break; }
			}
			pmiTotal = pmiRows * add.pmi;
		}
		var addTotal = add.tax + add.ins + add.hoa + add.pmi;
		var termK = region === "ca" && inp.reset ? Math.round(inp.reset.years * ppy) : 0;
		var res = {
			region: region, ppy: ppy, freq: inp.freq, price: price, down: down, base: base, premium: premium, premiumBp: bp, insured: insured, financed: financed,
			ltv: price ? base / price : null, comp: comp, sched: sched, plain: plain, hasExtra: hasExtra, add: add, addTotal: addTotal, payment: sched.pay,
			total: sched.pay + addTotal, pmiRows: pmiRows, pmiTotal: pmiTotal, pmiCancel: pmiCancel, warnings: warn, balloon: balloon, io: !!inp.io,
			interestToPrincipal: financed ? sched.interest / financed : 0, termK: termK
		};
		if (region === "ca") {
			var qr = qualifyingRateCA(inp.rate.f);
			res.qualRate = qr;
			var qp = periodic(rateOf(qr), 12, comp);
			res.qualPayment = pmt(financed, qp.f, Math.round(inp.years * 12), balloon);
		}
		if (region === "uk" && inp.sdltOn && price) res.sdlt = sdlt(price, { ftb: inp.sdltFtb, add: inp.sdltAdd });
		return res;
	}

	/* ------------------------------------------------------------------ affordability + payment -> loan */
	// a: { region, income (annual cents), debts (monthly cents), down (cents), rate (parsed), years, fixed, taxPct, ins (cents/yr), hoa (cents/mo), pmiPct, heat (cents/mo), condo (cents/mo), ftb30 }
	// US-style guideline: housing <= 28% of gross monthly income and housing + debts <= 36%. Canada: GDS 39% / TDS 44%, payment at the stress-test rate.
	function afford(a) {
		var ca = a.region === "ca", inc = a.income / 12, years = a.years;
		var lim = ca ? { f: 0.39, b: 0.44 } : { f: 0.28, b: 0.36 };
		var comp = ca && a.fixed ? "semi" : "ppy";
		var rate = ca ? rateOf(qualifyingRateCA(a.rate.f)) : a.rate;
		var fq = periodic(rate, 12, comp).f, fa = periodic(a.rate, 12, comp).f, n = Math.round(years * 12);
		function costs(P) {
			var base = Math.max(0, P - a.down), prem = 0, bp = 0;
			if (ca) { bp = cmhcBp(base, P, years); if (bp === null) return null; prem = Math.round(base * bp / 10000); }
			var pi = pmt(base + prem, fq, n), pmi = 0;
			if (a.region === "us" && base * 100 > P * 80 && a.pmiPct) pmi = Math.round(base * Number(a.pmiPct.n) / Number(a.pmiPct.d) / 1200);
			var tax = a.taxPct ? P * Number(a.taxPct.n) / Number(a.taxPct.d) / 1200 : 0;
			var housing = pi + tax + (ca ? 0 : (a.ins || 0) / 12 + (a.hoa || 0)) + pmi + (ca ? (a.heat || 0) + (a.condo || 0) * 0.5 : 0);   // Canada's GDS: P&I + tax + heat + half the condo fee (home insurance is not in it)
			return { base: base, prem: prem, bp: bp, pi: pi, pmi: pmi, tax: tax, housing: housing };
		}
		function ok(P) {
			var c = costs(P); if (!c) return false;
			if (ca && P > a.down && a.down < minDownCA(P)) return false;
			return c.housing <= lim.f * inc + 1e-6 && c.housing + (a.debts || 0) <= lim.b * inc + 1e-6;
		}
		if (!(inc > 0)) return null;
		var lo = a.down, hi = a.down + a.income * 12 + 100000;
		if (!ok(lo)) return { price: null, limits: lim, qualRate: ca ? rate.f : null };
		for (var i = 0; i < 70 && hi - lo > 1; i++) { var mid = Math.floor((lo + hi) / 2); if (ok(mid)) lo = mid; else hi = mid; }
		var P = Math.max(a.down, Math.floor(lo / 100) * 100), c = costs(P);   // whole dollars, rounded down (still inside the limits: costs only grow with the price)
		var actualPi = pmt(c.base + c.prem, fa, n);
		return { price: P, loan: c.base, premium: c.prem, financed: c.base + c.prem, housing: c.housing, pi: c.pi, actualPi: actualPi, pmi: c.pmi, front: c.housing / inc, back: (c.housing + (a.debts || 0)) / inc,
			limits: lim, bindingFront: (lim.f * inc - c.housing) <= (lim.b * inc - c.housing - (a.debts || 0)),
			qualRate: ca ? rate.f : null, maxHousing: Math.min(lim.f * inc, lim.b * inc - (a.debts || 0)) };
	}
	// target payment per payment period -> the biggest mortgage it can service; with a down payment also the price (Canada: net of the CMHC premium)
	function loanFromPayment(o) {
		var F = FREQ[o.freq] || FREQ.monthly, ppy = F.ppy, comp = o.region === "ca" && o.fixed ? "semi" : "ppy";
		var n = Math.round(o.years * ppy), f;
		if (F.acc) { f = periodic(o.rate, 12, comp).f; return finish(pv(o.payment * F.acc, f, Math.round(o.years * 12))); }
		f = periodic(o.rate, ppy, comp).f;
		return finish(pv(o.payment, f, n));
		function finish(maxLoan) {
			var out = { maxLoan: maxLoan, price: null, base: maxLoan, premium: 0 };
			if (o.down != null) {
				if (o.region === "ca") {
					var lo = o.down, hi = o.down + maxLoan + 1;
					for (var i = 0; i < 70 && hi - lo > 1; i++) {
						var mid = Math.floor((lo + hi) / 2), base = Math.max(0, mid - o.down), bp = cmhcBp(base, mid, o.years);
						if (bp !== null && base + Math.round(base * bp / 10000) <= maxLoan && !(mid > o.down && o.down < minDownCA(mid))) lo = mid; else hi = mid;
					}
					var b2 = Math.max(0, lo - o.down), bp2 = cmhcBp(b2, lo, o.years) || 0;
					out.price = lo; out.base = b2; out.premium = Math.round(b2 * bp2 / 10000);
				} else out.price = maxLoan + o.down;
			}
			return out;
		}
	}
	// payment (cents per payment) at several rates (percent numbers) for the same loan: rows [{rate, pay, interest, paid}]
	function sensitivity(inp, deltas) {
		return deltas.map(function (dl) {
			var r = Math.max(0, Math.round((inp.rate.f + dl) * 1e4) / 1e4), c = mortgage(Object.assign({}, inp, { rate: rateOf(r), reset: null }));
			return { delta: dl, rate: r, pay: c.payment, interest: c.sched.interest, paid: c.sched.paid, total: c.total };
		});
	}

	var api = {
		RULES_VERIFIED: RULES_VERIFIED, SOURCES: SOURCES, CONFORMING_2026: CONFORMING_2026, FREQ: FREQ, FREQ_ORDER: FREQ_ORDER, REGIONS: REGIONS, CURRENCIES: CURRENCIES,
		parseDec: parseDec, toNum: toNum, toCents: toCents, parseRate: parseRate, rateOf: rateOf, fixed: fixed,
		periodic: periodic, pmt: pmt, pv: pv, dateAt: dateAt, ymd: ymd, parseDate: parseDate, addMonths: addMonths, schedule: schedule, balanceAt: balanceAt,
		duration: duration, durationText: durationText, minDownCA: minDownCA, cmhcBp: cmhcBp, qualifyingRateCA: qualifyingRateCA, sdlt: sdlt,
		mortgage: mortgage, afford: afford, loanFromPayment: loanFromPayment, sensitivity: sensitivity
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	else root.MC = api;
})(typeof window !== "undefined" ? window : this);

/* MES Mortgage Calculator 2.0 -- mes.fm/mortgagecalculator (UI; the maths and the rules tables are in lib.js, global `MC`)
 * Three modes (my payment / how much can I afford / payment -> loan size), five country presets (US PMI + PITI, Canada CMHC + semi-annual compounding +
 * stress test, UK repayment / interest-only + SDLT, Australia, generic), six payment frequencies, full schedule + charts, extra payments, renewal / ARM
 * rate change, compare two scenarios, rate sensitivity, shareable query-string links (?r=ca&p=650000&dp=10&i=4.5&y=25 ...) and the old 2013
 * /mortgagecalculator/s/<id> links (stored {value, dp-percent, loan (years), date, rate, tax, pmi, pmi-months, balloon} in Redis; read through /api/share?calc=mc&id=<id>).
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var KEY = "mes-mortgagecalculator:v1";
	var REG = MC.REGIONS;
	var LOC = (navigator.languages && navigator.languages[0]) || navigator.language || "en-US";
	var NAMES = { monthly: "Monthly", semimonthly: "Semi-monthly", biweekly: "Bi-weekly", accbiweekly: "Accelerated bi-weekly", weekly: "Weekly", accweekly: "Accelerated weekly" };
	var DEF = { r: "us", cur: "USD", m: "pay", inp: "price", price: "", dp: "", du: "%", loan: "", rate: "", rt: "fixed", years: "", freq: "monthly", sd: "", tax: "", ins: "", hoa: "", pmi: "", ht: "",
		ftb: false, ukt: "repay", sdlt: false, sf: false, sa: false, bal: "", xm: "", xy: "", xl: "", xd: "", rs: false, ry: "5", rr: "", inc: "", debts: "", adp: "", tp: "", tdp: "",
		cr: "", cy: "", cf: "", vw: "year" };
	var PRESET_KEYS = ["price", "dp", "rate", "years", "tax", "ins", "hoa", "pmi", "cur", "ry"];
	var st = {}, last = null, fmtC = null, openYears = {};

	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function today() { var t = new Date(); return t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2); }

	/* ------------------------------------------------------------ formatting */
	function mkfmt() {
		fmtC = null;
		try {
			if (st.cur) fmtC = new Intl.NumberFormat(LOC, { style: "currency", currency: st.cur, currencyDisplay: "narrowSymbol", minimumFractionDigits: 2, maximumFractionDigits: 2 });
			else fmtC = new Intl.NumberFormat(LOC, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		} catch (e) { fmtC = null; }
	}
	function money(c) {
		var v = c / 100;
		if (fmtC) { var s = fmtC.format(v); return s.replace(/^-(.*)$/, "−$1"); }
		return (st.cur ? st.cur + " " : "") + v.toFixed(2);
	}
	function m0(c) { return c % 100 === 0 && fmtC ? fmtC0(c) : money(c); }
	function fmtC0(c) { try { return new Intl.NumberFormat(LOC, st.cur ? { style: "currency", currency: st.cur, currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 0 } : { maximumFractionDigits: 0 }).format(c / 100).replace(/^-(.*)$/, "\u2212$1"); } catch (e) { return money(c); } }
	function sym() {
		if (!st.cur) return "";
		try { var p = new Intl.NumberFormat(LOC, { style: "currency", currency: st.cur, currencyDisplay: "narrowSymbol" }).formatToParts(0); for (var i = 0; i < p.length; i++) if (p[i].type === "currency") return p[i].value; } catch (e) {}
		return st.cur;
	}
	function trim1(x) { return (Math.round(x * 10) / 10).toString(); }
	function short(c) {
		var v = Math.abs(c) / 100, s = sym();
		return (c < 0 ? "−" : "") + s + (v >= 1e6 ? trim1(v / 1e6) + "M" : v >= 1e3 ? trim1(v / 1e3) + "k" : String(Math.round(v)));
	}
	function pctf(x, dp) { return (x * 100).toFixed(dp == null ? 1 : dp) + "%"; }
	function ratef(x) { return (Math.round(x * 1e4) / 1e4) + "%"; }
	function monthYear(d) { try { return new Date(Date.UTC(d.y, d.m - 1, 1)).toLocaleDateString(LOC, { month: "long", year: "numeric", timeZone: "UTC" }); } catch (e) { return d.m + "/" + d.y; } }
	function fullDate(d) { try { return new Date(Date.UTC(d.y, d.m - 1, d.d)).toLocaleDateString(LOC, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); } catch (e) { return d.y + "-" + d.m + "-" + d.d; } }
	function plainC(c) { return MC.fixed(c); }
	function cstr(c) { return c % 100 === 0 ? String(c / 100) : MC.fixed(c); }
	function fname(f) { return NAMES[f] || "Monthly"; }

	/* ------------------------------------------------------------ state -> numbers */
	function parseStart() { return MC.parseDate(st.sd) || MC.parseDate(today()); }
	function calcInput(over) {
		over = over || {};
		var R = st.r, f = over.freq || st.freq, ppy = MC.FREQ[f].ppy, years = over.years != null ? over.years : MC.toNum(st.years);
		var rate = over.rate || MC.parseRate(st.rate);
		var price = MC.toCents(st.price) || 0, loanOnly = st.inp === "loan", loan = MC.toCents(st.loan) || 0, down = 0;
		if (!loanOnly) {
			if (st.du === "%") { var pr = MC.parseRate(st.dp); down = pr ? Math.round(price * Number(pr.n) / Number(pr.d) / 100) : 0; } else down = MC.toCents(st.dp) || 0;
		}
		var start = parseStart(), xm = MC.toCents(st.xm) || 0, xy = MC.toCents(st.xy) || 0, xl = MC.toCents(st.xl) || 0, xd = MC.parseDate(st.xd) || start;
		var ry = MC.toNum(st.ry), rr = MC.parseRate(st.rr), reset = null;
		if (st.rs && ry > 0 && ry < years && rr) reset = { years: ry, rate: rr };
		return { region: R, price: price || null, down: down, loan: loan, loanOnly: loanOnly, rate: rate, years: years, freq: f, fixed: st.rt === "fixed",
			balloon: MC.toCents(st.bal) || 0, io: R === "uk" && st.ukt === "io", taxPct: MC.parseRate(st.tax), ins: MC.toCents(st.ins) || 0, hoa: MC.toCents(st.hoa) || 0,
			pmiPct: MC.parseRate(st.pmi), ftb30: st.ftb, start: start, reset: reset,
			extra: { per: Math.round(xm * 12 / ppy), yearly: xy, lump: xl ? { amount: xl, date: xd } : null },
			sdltOn: st.sdlt, sdltFtb: st.sf, sdltAdd: st.sa };
	}
	function validCore() {   // rate + years present and sane
		var rate = MC.parseRate(st.rate), years = MC.toNum(st.years);
		if (!rate) return "Enter the interest rate to see your result.";
		if (rate.f > 100) return "That interest rate looks too high.";
		if (!(years > 0)) return "Enter the loan term in years.";
		if (years > 60) return "Loan terms over 60 years are not supported.";
		return "";
	}

	/* ------------------------------------------------------------ controls */
	function symTag() { var s = sym(); [].forEach.call(document.querySelectorAll("#mc .mc-cur-tag"), function (e) { e.textContent = s; }); }
	function regionOK(el) { var r = el.getAttribute("data-r"); return !r || r.split(" ").indexOf(st.r) >= 0; }
	function modeOK(el) { var m = el.getAttribute("data-m"); return !m || m.split(" ").indexOf(st.m) >= 0; }
	function setPressed(box, val) { [].forEach.call(box.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === val)); }); }
	function buildStatic() {
		var h = "";
		MC.CURRENCIES.forEach(function (c) { h += '<option value="' + c[0] + '">' + c[0] + " – " + esc(c[1]) + "</option>"; });
		$("mc-cur").innerHTML = '<option value="">No symbol</option>' + h;
		var fo = MC.FREQ_ORDER.map(function (k) { return '<option value="' + k + '">' + esc(MC.FREQ[k].label) + " – " + MC.FREQ[k].ppy + " a year</option>"; }).join("");
		$("mc-freq").innerHTML = fo;
		$("mc-cf").innerHTML = '<option value="">same as A</option>' + fo;
		$("mc-yrchips").innerHTML = [10, 15, 20, 25, 30].map(function (y) { return '<button type="button" class="tu-chip" data-y="' + y + '">' + y + " years</button>"; }).join("");
		$("mc-verified").textContent = MC.RULES_VERIFIED;
		$("mc-sources").innerHTML = MC.SOURCES.map(function (s) { return '<a href="' + s[1] + '" target="_blank" rel="noopener">' + esc(s[0]) + "</a>"; }).join("; ");
	}
	var HOA_LABEL = { us: "HOA fees (per month)", ca: "Condo fees (per month)", uk: "Service charge / ground rent (per month)", au: "Strata / body corporate (per month)", other: "Other monthly costs" };
	var COSTS_NOTE = {
		us: "Property tax and insurance vary a lot by county and home: replace these placeholders with your own. PMI applies only with under 20% down.",
		ca: "Property tax varies by city; condo fees count half toward the lender&rsquo;s GDS ratio. Heating (used for affordability) is typically $100&ndash;$150 a month.",
		uk: "Council tax is not a percentage of the price, so it is not included unless you add it under &ldquo;monthly costs&rdquo;.",
		au: "Council rates and strata are not a percentage of the price: add them as a yearly or monthly amount if you want them counted.",
		other: "Add any recurring cost of owning the home that you want in the monthly total."
	};
	function writeControls() {
		mkfmt(); symTag();
		var map = { "mc-price": "price", "mc-dp": "dp", "mc-loan": "loan", "mc-rate": "rate", "mc-years": "years", "mc-tax": "tax", "mc-ins": "ins", "mc-hoa": "hoa", "mc-pmi": "pmi", "mc-ht": "ht",
			"mc-bal": "bal", "mc-xm": "xm", "mc-xy": "xy", "mc-xl": "xl", "mc-xd": "xd", "mc-ry": "ry", "mc-rr": "rr", "mc-inc": "inc", "mc-debts": "debts", "mc-adp": "adp", "mc-tp": "tp", "mc-tdp": "tdp",
			"mc-cr": "cr", "mc-cy": "cy", "mc-sd": "sd", "mc-start": "sd" };
		for (var id in map) { var el = $(id); if (el && document.activeElement !== el) el.value = st[map[id]] == null ? "" : st[map[id]]; }
		$("mc-cur").value = st.cur; $("mc-freq").value = st.freq; $("mc-rt").value = st.rt; $("mc-ukt").value = st.ukt; $("mc-cf").value = st.cf;
		$("mc-ftb30").checked = st.ftb; $("mc-sdlt").checked = st.sdlt; $("mc-sf").checked = st.sf; $("mc-sa").checked = st.sa; $("mc-rs").checked = st.rs;
		setPressed($("mc-region"), st.r); setPressed($("mc-mode"), st.m); setPressed($("mc-inp"), st.inp); setPressed($("mc-dpu"), st.du); setPressed($("mc-vw"), st.vw);
		$("mc-dp-tag").textContent = st.du === "%" ? "%" : sym();
		$("mc-sdlt-opts").hidden = !st.sdlt;
		var loanOnly = st.inp === "loan";
		$("mc-dp-wrap").hidden = loanOnly; $("mc-loan-wrap").hidden = !loanOnly;
		$("mc-price-label").textContent = loanOnly ? "Home value (optional)" : "Home price";
		$("mc-hoa-label").textContent = HOA_LABEL[st.r];
		$("mc-costs-note").innerHTML = COSTS_NOTE[st.r];
		var ca = st.r === "ca", us = st.r === "us";
		$("mc-years-label").textContent = ca ? "Amortization (years)" : "Loan term (years)";
		$("mc-yrchips-label").textContent = ca ? "Common amortizations" : "Common terms";
		$("mc-region-sum").textContent = ca ? "Canadian insurance & amortization rules" : "UK options";
		$("mc-reset-sum").textContent = ca ? "Mortgage term & renewal rate" : "Rate change (ARM / adjustable)";
		$("mc-ry-label").textContent = ca ? "Mortgage term (years)" : "Initial fixed period (years)";
		$("mc-rs-label").textContent = ca ? "Model a different rate at renewal (end of the term)" : "The rate changes after the initial period (e.g. a 5/1 ARM)";
		$("mc-rr-label").textContent = ca ? "Renewal rate" : "Adjusted rate";
		$("mc-reset-note").innerHTML = ca ? "The term is how long your rate is fixed (typically 5 years). The result shows your balance at the end of it. Tick the box and enter a renewal rate to see the new payment on the remaining balance and amortization." : "At the end of the initial period the payment is recalculated on the remaining balance and the years left, at the new rate. This is a simple one-change model: real ARMs adjust periodically within caps.";
		$("mc-rr-wrap").hidden = !st.rs;
		$("mc-tp-hint").textContent = "principal & interest, per " + (MC.FREQ[st.freq].per);
		var fn = "";
		if (st.freq === "accbiweekly") fn = "Accelerated bi-weekly pays half of the monthly payment every two weeks: 26 payments a year, equal to 13 monthly payments, so the loan ends sooner.";
		else if (st.freq === "accweekly") fn = "Accelerated weekly pays a quarter of the monthly payment every week: 52 payments a year, equal to 13 monthly payments.";
		else if (st.freq === "biweekly") fn = "Bi-weekly recalculates the payment for 26 payments a year (monthly payment × 12 ÷ 26): about the same total cost as monthly. Choose the accelerated option to pay off sooner.";
		$("mc-freqnote").textContent = fn;
		// visibility by mode / region
		[].forEach.call(document.querySelectorAll("#mc [data-m], #mc [data-r]"), function (el) { el.hidden = !(modeOK(el) && regionOK(el)); });
		var names = { us: "the United States", ca: "Canada", uk: "the United Kingdom", au: "Australia", other: "any country" };
		$("mc-rules-name").textContent = names[st.r];
		[].forEach.call($("mc-rules").children, function (c) { if (c.hasAttribute("data-r")) c.hidden = c.getAttribute("data-r") !== st.r; });
		[].forEach.call($("mc-yrchips").children, function (b) { b.setAttribute("aria-pressed", String(String(MC.toNum(st.years)) === b.getAttribute("data-y"))); });
		$("mc-payres").hidden = st.m !== "pay";
		$("mc-options").hidden = false;
	}
	function summaries() {
		function s(id, t) { $(id).textContent = t ? "– " + t : ""; }
		var p = [], tax = MC.parseRate(st.tax), ins = MC.toCents(st.ins), hoa = MC.toCents(st.hoa);
		if (tax && tax.n > 0n) p.push(MC.toNum(st.tax) + "% tax");
		if (ins) p.push(money(ins) + "/yr insurance"); if (hoa) p.push(money(hoa) + "/mo fees");
		if (st.r === "us" && MC.parseRate(st.pmi) && MC.parseRate(st.pmi).n > 0n) p.push("PMI " + MC.toNum(st.pmi) + "%");
		s("mc-s-costs", p.join(", "));
		var e = [], xm = MC.toCents(st.xm), xy = MC.toCents(st.xy), xl = MC.toCents(st.xl);
		if (xm) e.push(money(xm) + "/month"); if (xy) e.push(money(xy) + "/year"); if (xl) e.push(money(xl) + " lump sum");
		s("mc-s-extra", e.join(", "));
		s("mc-s-reset", st.rs && MC.parseRate(st.rr) ? "from year " + st.ry + " at " + MC.toNum(st.rr) + "%" : (st.r === "ca" ? st.ry + "-year term" : ""));
		s("mc-s-bal", MC.toCents(st.bal) ? money(MC.toCents(st.bal)) : "");
		var r = [];
		if (st.r === "ca" && st.ftb) r.push("30-year allowed");
		if (st.r === "uk") { r.push(st.ukt === "io" ? "interest-only" : "repayment"); if (st.sdlt) r.push("stamp duty"); }
		s("mc-s-region", r.join(", "));
	}

	/* ------------------------------------------------------------ result pieces */
	function tile(label, value, sub, o) {
		o = o || {};
		return '<div class="tu-stat' + (o.hero ? " tu-stat--hero" : "") + ' mc-tile" tabindex="0" role="button" data-copy="' + esc(o.copy || value) + '" title="Click to copy"><div class="tu-stat__label">' + esc(label) +
			'</div><div class="tu-stat__value' + (o.cls ? " " + o.cls : "") + '">' + esc(value) + "</div>" + (sub ? '<div class="tu-stat__sub">' + sub + "</div>" : "") + "</div>";
	}
	function setEmpty(msg) {
		$("mc-empty").hidden = !msg; $("mc-empty-text").textContent = msg || "";
		$("mc-out").hidden = !!msg; $("mc-side").hidden = true;
		if (msg) $("mc-payres").hidden = true; else $("mc-payres").hidden = st.m !== "pay";
		$("mc-warn").innerHTML = "";
	}
	function warnHtml(list, info) {
		var h = "";
		(list || []).forEach(function (w) { h += '<div class="mc-warnitem">&#9888; ' + esc(w.replace(/\{\{(\d+)\}\}/g, function (m, n) { return m0(+n); })) + "</div>"; });
		(info || []).forEach(function (w) { h += '<div class="mc-infoitem">' + w + "</div>"; });
		$("mc-warn").innerHTML = h;
	}

	function renderPay() {
		var bad = validCore();
		if (bad) return setEmpty(bad), null;
		var price = MC.toCents(st.price), loanOnly = st.inp === "loan";
		if (!loanOnly && !price) return setEmpty("Enter the home price to see your payment."), null;
		if (loanOnly && !MC.toCents(st.loan)) return setEmpty("Enter the loan amount to see your payment."), null;
		var inp = calcInput(), ppy = MC.FREQ[inp.freq].ppy;
		if (Math.round(inp.years * ppy) < 1) return setEmpty("The loan term is too short for this payment frequency."), null;
		if ((inp.price || 0) > 1e13 || inp.loan > 1e13) return setEmpty("That amount is too large."), null;
		var c = MC.mortgage(inp);
		if (c.financed <= 0) return setEmpty("The down payment covers the whole price, so there is nothing to borrow."), null;
		setEmpty("");
		var s = c.sched, fn = fname(inp.freq), perN = MC.FREQ[inp.freq].per, dur = MC.durationText(s.periods, ppy);
		var tiles = [];
		var paySub = c.io ? "interest only" : "principal &amp; interest";
		if (s.payAfter) paySub += "<br>then <b>" + money(s.payAfter) + "</b> after " + MC.toNum(st.ry) + " years at " + MC.toNum(st.rr) + "%";
		if (c.hasExtra) paySub += "<br>+ your extra payments";
		tiles.push(tile(fn + " payment", money(c.payment), paySub, { hero: true }));
		if (c.addTotal > 0) {
			var parts = []; if (c.add.tax) parts.push("tax " + money(c.add.tax)); if (c.add.ins) parts.push("insurance " + money(c.add.ins)); if (c.add.hoa) parts.push("fees " + money(c.add.hoa)); if (c.add.pmi) parts.push("PMI " + money(c.add.pmi));
			tiles.push(tile("Total " + fn.toLowerCase() + " payment", money(c.total), "with " + parts.join(", "), { hero: true }));
		}
		var ls = [];
		if (c.ltv != null) ls.push("loan-to-value " + pctf(c.ltv));
		if (c.premium) ls.push("includes " + m0(c.premium) + " mortgage insurance");
		tiles.push(tile("Loan amount", m0(c.financed), ls.join("<br>") || "the amount you borrow"));
		tiles.push(tile("Total interest", money(s.interest), "over " + dur));
		var sub = "principal + interest, " + s.periods + " payments";
		if (c.addTotal > 0) sub += "<br>with tax, insurance &amp; fees: " + money(s.paid + (c.add.tax + c.add.ins + c.add.hoa) * s.periods + c.pmiTotal);
		tiles.push(tile("Total of payments", money(s.paid), sub));
		tiles.push(tile("Mortgage-free", monthYear(s.payoff), dur + (c.hasExtra ? "<br>" + MC.durationText(c.plain.periods - s.periods, ppy) + " sooner" : ""), { copy: monthYear(s.payoff) }));
		tiles.push(tile("Interest per " + (sym() || "") + "1 borrowed", (c.interestToPrincipal).toFixed(2), "interest is " + pctf(c.interestToPrincipal, 0) + " of the loan", { copy: c.interestToPrincipal.toFixed(2) }));
		if (c.io) tiles.push(tile("Still owed at the end", money(c.financed), "interest-only: the loan is repaid in full at the end"));
		else if (c.balloon > 0) tiles.push(tile("Balloon payment", money(c.balloon), "due with the last payment"));
		if (inp.region === "ca") {
			if (c.insured) tiles.push(tile("Mortgage insurance", m0(c.premium), (c.premiumBp / 100).toFixed(2) + "% of " + m0(c.base) + ", added to the loan"));
			var ry = MC.toNum(st.ry);
			if (ry > 0 && ry < inp.years) tiles.push(tile("Balance after " + ry + "-year term", money(MC.balanceAt(s, Math.round(ry * ppy))), "what you renew"));
			tiles.push(tile("Stress-test rate", ratef(c.qualRate), "qualify at " + money(c.qualPayment) + " a month", { copy: ratef(c.qualRate) }));
		}
		if (inp.region === "us" && c.add.pmi) tiles.push(tile("PMI", money(c.add.pmi), c.pmiCancel ? "until " + monthYear(c.pmiCancel) + " (" + money(c.pmiTotal) + " in total)" : "for the whole loan"));
		if (c.sdlt != null) tiles.push(tile("Stamp duty (SDLT)", money(c.sdlt), "due at completion with your " + money(c.down) + " deposit"));
		$("mc-hero").innerHTML = tiles.join("");
		var hn = [];
		if (c.price) hn.push("Down payment " + m0(c.down) + " (" + pctf(c.price ? c.down / c.price : 0) + ")");
		hn.push("first payment " + fullDate(s.rows[0].d));
		$("mc-hero-note").textContent = hn.join(" · ") + ". Click a tile to copy it.";
		// warnings + info
		var info = [];
		if (inp.region === "us" && c.financed > MC.CONFORMING_2026) info.push("This loan is above the 2026 baseline conforming loan limit (" + money(MC.CONFORMING_2026) + "; up to $1,249,125 in high-cost counties), so it is a jumbo loan: rates and down-payment rules differ.");
		if (inp.region === "us" && c.ltv != null && c.ltv > 0.8 && !c.add.pmi) info.push("With under 20% down most conventional loans need PMI: enter a PMI rate in &ldquo;Taxes, insurance &amp; other costs&rdquo;.");
		if (c.io) info.push("Interest-only: you never reduce the loan during the term, so the full " + money(c.financed) + " is due at the end (the schedule shows it as the final payment).");
		warnHtml(c.warnings, info);
		// breakdown bar of the first payment
		var f0 = s.rows[0], segs = [["Principal", f0.prin + f0.ex, "mc-c1"], ["Interest", f0.int, "mc-c2"], ["Property tax", c.add.tax, "mc-c3"], ["Insurance", c.add.ins, "mc-c4"], ["Fees (HOA / condo)", c.add.hoa, "mc-c5"], ["PMI", c.add.pmi, "mc-c6"]];
		var tot = 0; segs.forEach(function (x) { tot += x[1]; });
		$("mc-break-card").hidden = !(tot > 0);
		if (tot > 0) {
			$("mc-bar").innerHTML = segs.filter(function (x) { return x[1] > 0; }).map(function (x) { return '<span class="' + x[2] + '" style="width:' + (x[1] / tot * 100) + '%" title="' + esc(x[0] + ": " + money(x[1])) + '"></span>'; }).join("");
			$("mc-bar").setAttribute("aria-label", "First payment split: " + segs.filter(function (x) { return x[1] > 0; }).map(function (x) { return x[0] + " " + money(x[1]); }).join(", "));
			$("mc-legend").innerHTML = segs.filter(function (x) { return x[1] > 0; }).map(function (x) { return '<span><i class="' + x[2] + '"></i>' + esc(x[0]) + " <b>" + money(x[1]) + "</b> (" + pctf(x[1] / tot, 0) + ")</span>"; }).join("") + '<span class="tu-note" style="margin:0;">first payment; later ones are mostly principal</span>';
		}
		// extra payments
		$("mc-extra-card").hidden = !c.hasExtra;
		if (c.hasExtra) {
			var saved = c.plain.interest - s.interest, extraPaid = 0; s.rows.forEach(function (r) { extraPaid += r.ex; });
			$("mc-extra-stats").innerHTML = tile("Interest saved", money(saved), "vs. " + money(c.plain.interest) + " without extras", { hero: true, cls: "tu-pos" }) +
				tile("Finish earlier by", MC.durationText(c.plain.periods - s.periods, ppy), (c.plain.periods - s.periods) + " fewer payments") +
				tile("New payoff date", monthYear(s.payoff), "instead of " + monthYear(c.plain.payoff)) +
				tile("Extra money paid in", money(extraPaid), extraPaid ? "each extra " + money(100) + " saves about " + money(Math.round(saved / extraPaid * 100)) : "");
		}
		var sent = (loanOnly ? "A " + m0(c.financed) + " mortgage" : "A " + m0(c.price) + " home with " + m0(c.down) + " down (" + pctf(c.down / c.price, 0) + ")") + " at " + st.rate.trim() + "% over " + MC.toNum(st.years) + " years costs " + money(c.payment) +
			" " + (inp.freq === "monthly" ? "a month" : fn.toLowerCase() + " (every payment)") + " in principal &amp; interest" + (c.addTotal ? "; " + money(c.total) + " with tax, insurance and fees" : "") + ". Total interest: " + money(s.interest) + "; mortgage-free by " + monthYear(s.payoff) + ".";
		var plainSent = sent.replace(/&amp;/g, "&");
		$("mc-sentence").textContent = plainSent + " mes.fm/mortgagecalculator";
		last = { c: c, inp: inp, sentence: plainSent + " " + location.origin + "/mortgagecalculator" + shareQuery() };
		renderCharts(c); renderSched(c); renderCmp(c, inp); renderSens(inp, c);
		return c;
	}

	/* ------------------------------------------------------------ charts (inline SVG, no libraries) */
	var W = 720, H = 300, ML = 58, MR = 16, MT = 14, MB = 30;
	function niceMax(v) {
		if (v <= 0) return 100;
		var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p, steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10], m = 10; for (var q = 0; q < steps.length; q++) if (n <= steps[q] + 1e-9) { m = steps[q]; break; }
		return m * p;
	}
	function yearTicks(maxY) { var step = maxY <= 6 ? 1 : maxY <= 12 ? 2 : maxY <= 30 ? 5 : 10, a = []; for (var y = 0; y <= maxY + 0.001; y += step) a.push(y); return a; }
	function renderCharts(c) {
		var s = c.sched, ppy = s.ppy, rows = s.rows, N = rows.length, maxY = N / ppy;
		var cum = new Array(N + 1), ci = 0; cum[0] = 0;
		for (var i = 0; i < N; i++) { ci += rows[i].int; cum[i + 1] = ci; }
		var yMaxV = Math.max(s.loan, ci, c.plain.interest), yTop = niceMax(yMaxV * 1.02);
		var pw = W - ML - MR, ph = H - MT - MB;
		function X(k) { return ML + (k / ppy) / (Math.max(maxY, c.hasExtra ? c.plain.periods / ppy : 0)) * pw; }
		var xMaxYears = Math.max(maxY, c.hasExtra ? c.plain.periods / ppy : 0);
		function X2(k) { return ML + (k / ppy) / xMaxYears * pw; }
		function Y(v) { return MT + ph - v / yTop * ph; }
		var stride = Math.max(1, Math.floor(N / 400));
		function path(getV, nPts, from0) {
			var d = "", k;
			for (k = 0; k <= nPts; k += stride) d += (d ? "L" : "M") + X2(k).toFixed(1) + "," + Y(getV(k)).toFixed(1);
			if ((nPts % stride) !== 0) d += "L" + X2(nPts).toFixed(1) + "," + Y(getV(nPts)).toFixed(1);
			return d;
		}
		var balF = function (k) { return k === 0 ? s.loan : rows[k - 1].bal; };
		var balPlain = function (k) { return k === 0 ? s.loan : c.plain.rows[k - 1].bal; };
		var svg = '<svg viewBox="0 0 ' + W + " " + H + '" class="mc-svg" role="img" aria-label="Chart of the remaining balance and the interest paid so far over the life of the loan" preserveAspectRatio="xMidYMid meet">';
		for (var g = 0; g <= 4; g++) { var gv = yTop * g / 4; svg += '<line class="mc-grid" x1="' + ML + '" x2="' + (W - MR) + '" y1="' + Y(gv).toFixed(1) + '" y2="' + Y(gv).toFixed(1) + '"/><text class="mc-tx" x="' + (ML - 6) + '" y="' + (Y(gv) + 4).toFixed(1) + '" text-anchor="end">' + esc(short(gv)) + "</text>"; }
		yearTicks(xMaxYears).forEach(function (y) { var x = ML + y / xMaxYears * pw; svg += '<text class="mc-tx" x="' + x.toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + (y === 0 ? "start" : "yr " + y) + "</text>"; });
		var area = path(balF, N) + "L" + X2(N).toFixed(1) + "," + Y(0).toFixed(1) + "L" + X2(0).toFixed(1) + "," + Y(0).toFixed(1) + "Z";
		svg += '<path class="mc-area" d="' + area + '"/>';
		if (c.hasExtra) svg += '<path class="mc-base" d="' + path(balPlain, c.plain.rows.length) + '"/>';
		svg += '<path class="mc-lbal" d="' + path(balF, N) + '"/><path class="mc-lint" d="' + path(function (k) { return cum[k]; }, N) + '"/>';
		if (s.crossK) { var cx = X2(s.crossK).toFixed(1); svg += '<line class="mc-cross" x1="' + cx + '" x2="' + cx + '" y1="' + MT + '" y2="' + (MT + ph) + '"/><text class="mc-tx mc-txb" x="' + (+cx + 4) + '" y="' + (MT + 12) + '">principal overtakes interest</text>'; }
		svg += '<line class="mc-hov" id="mc-hov" x1="0" x2="0" y1="' + MT + '" y2="' + (MT + ph) + '" visibility="hidden"/><circle class="mc-dot1" id="mc-dot1" r="4" visibility="hidden"/><circle class="mc-dot2" id="mc-dot2" r="4" visibility="hidden"/>';
		svg += '<rect x="' + ML + '" y="' + MT + '" width="' + pw + '" height="' + ph + '" fill="transparent" id="mc-hit" style="touch-action:pan-y;"/></svg>';
		$("mc-chart1").innerHTML = svg;
		$("mc-leg1").innerHTML = '<span><i class="mc-c1"></i>Remaining balance</span><span><i class="mc-c2"></i>Interest paid so far</span>' + (c.hasExtra ? '<span><i class="mc-ln"></i>Balance without extras</span>' : "");
		var hit = $("mc-hit"), ro = $("mc-readout");
		function onMove(ev) {
			var r = $("mc-chart1").querySelector("svg").getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W;
			var k = Math.round((px - ML) / pw * xMaxYears * ppy); k = Math.max(0, Math.min(N, k));
			var x = X2(k).toFixed(1), b = balF(k), it = cum[k];
			$("mc-hov").setAttribute("x1", x); $("mc-hov").setAttribute("x2", x); $("mc-hov").setAttribute("visibility", "visible");
			$("mc-dot1").setAttribute("cx", x); $("mc-dot1").setAttribute("cy", Y(b)); $("mc-dot1").setAttribute("visibility", "visible");
			$("mc-dot2").setAttribute("cx", x); $("mc-dot2").setAttribute("cy", Y(it)); $("mc-dot2").setAttribute("visibility", "visible");
			var when = k === 0 ? "Start" : "Payment " + k + " (" + fullDate(rows[k - 1].d) + ")";
			ro.innerHTML = "<b>" + esc(when) + "</b> &middot; balance <b>" + esc(money(b)) + "</b> &middot; interest paid so far <b>" + esc(money(it)) + "</b> &middot; principal paid <b>" + esc(money(s.loan - b)) + "</b>";
		}
		hit.addEventListener("pointermove", onMove); hit.addEventListener("pointerdown", onMove);
		hit.addEventListener("pointerleave", function () { $("mc-hov").setAttribute("visibility", "hidden"); $("mc-dot1").setAttribute("visibility", "hidden"); $("mc-dot2").setAttribute("visibility", "hidden"); ro.textContent = "Move over the chart to read it."; });
		// stacked bars per loan year
		var yrs = Math.ceil(N / ppy), P = [], I = [], j, mx = 0;
		for (j = 0; j < yrs; j++) { P.push(0); I.push(0); }
		rows.forEach(function (r) { var y = Math.floor((r.k - 1) / ppy); P[y] += r.prin + r.ex; I[y] += r.int; });
		for (j = 0; j < yrs; j++) mx = Math.max(mx, P[j] + I[j]);
		var top2 = niceMax(mx * 1.02), bw = pw / yrs, s2 = '<svg viewBox="0 0 ' + W + " " + H + '" class="mc-svg" role="img" aria-label="Stacked bars of principal and interest paid in each year of the loan" preserveAspectRatio="xMidYMid meet">';
		function Y2(v) { return MT + ph - v / top2 * ph; }
		for (g = 0; g <= 4; g++) { var v2 = top2 * g / 4; s2 += '<line class="mc-grid" x1="' + ML + '" x2="' + (W - MR) + '" y1="' + Y2(v2).toFixed(1) + '" y2="' + Y2(v2).toFixed(1) + '"/><text class="mc-tx" x="' + (ML - 6) + '" y="' + (Y2(v2) + 4).toFixed(1) + '" text-anchor="end">' + esc(short(v2)) + "</text>"; }
		var every = yrs <= 12 ? 1 : yrs <= 30 ? 5 : 10;
		for (j = 0; j < yrs; j++) {
			var x0 = ML + j * bw + bw * 0.12, w0 = bw * 0.76, hp = P[j] / top2 * ph, hi = I[j] / top2 * ph, tip = "Year " + (j + 1) + ": principal " + money(P[j]) + ", interest " + money(I[j]);
			s2 += '<g><title>' + esc(tip) + '</title><rect class="mc-bi" x="' + x0.toFixed(1) + '" y="' + (MT + ph - hp - hi).toFixed(1) + '" width="' + w0.toFixed(1) + '" height="' + hi.toFixed(1) + '"/><rect class="mc-bp" x="' + x0.toFixed(1) + '" y="' + (MT + ph - hp).toFixed(1) + '" width="' + w0.toFixed(1) + '" height="' + hp.toFixed(1) + '"/></g>';
			if ((j + 1) % every === 0 || j === 0) s2 += '<text class="mc-tx" x="' + (x0 + w0 / 2).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + (j + 1) + "</text>";
		}
		s2 += "</svg>";
		$("mc-chart2").innerHTML = s2;
		$("mc-leg2").innerHTML = '<span><i class="mc-c1"></i>Principal (incl. extra payments)</span><span><i class="mc-c2"></i>Interest</span><span class="tu-note" style="margin:0;">x axis = loan year</span>';
		$("mc-cross").textContent = s.crossK ? "In payment " + s.crossK + " (" + monthYear(rows[s.crossK - 1].d) + ", about " + MC.durationText(s.crossK, ppy) + " in) more of each payment goes to principal than to interest." : (c.io ? "With an interest-only loan no principal is paid until the end." : "");
	}

	/* ------------------------------------------------------------ schedule */
	function csvText(c) {
		var out = ["Payment,Date,Payment amount,Principal,Interest,Extra,Balance"];
		c.sched.rows.forEach(function (r) { out.push([r.k, r.d.y + "-" + ("0" + r.d.m).slice(-2) + "-" + ("0" + r.d.d).slice(-2), plainC(r.pay), plainC(r.prin), plainC(r.int), plainC(r.ex), plainC(r.bal)].join(",")); });
		return out.join("\n");
	}
	function rowHtml(r, cls, hasEx) {
		return "<tr" + (cls ? ' class="' + cls + '"' : "") + "><td>" + r.k + " &middot; " + esc(fullDate(r.d)) + "</td><td>" + esc(money(r.pay)) + "</td><td>" + esc(money(r.prin)) + "</td><td>" + esc(money(r.int)) + "</td>" + (hasEx ? "<td>" + esc(money(r.ex)) + "</td>" : "") + "<td>" + esc(money(r.bal)) + "</td></tr>";
	}
	function renderSched(c) {
		var s = c.sched, rows = s.rows, hasEx = c.hasExtra, head = "<thead><tr><th>" + (st.vw === "all" ? "Payment &middot; date" : "Year") + "</th><th>Payment</th><th>Principal</th><th>Interest</th>" + (hasEx ? "<th>Extra</th>" : "") + "<th>Balance</th></tr></thead>";
		var h = head + "<tbody>";
		if (st.vw === "all") {
			rows.forEach(function (r) { h += rowHtml(r, r.k === s.crossK ? "is-active" : "", hasEx); });
			$("mc-sched-note").textContent = "Every payment, " + rows.length + " in total. The highlighted row is where principal overtakes interest.";
		} else {
			var years = [], map = {};
			rows.forEach(function (r) { var y = r.d.y; if (!map[y]) { map[y] = { y: y, pay: 0, prin: 0, int: 0, ex: 0, bal: 0, rows: [] }; years.push(map[y]); } var m = map[y]; m.pay += r.pay; m.prin += r.prin; m.int += r.int; m.ex += r.ex; m.bal = r.bal; m.rows.push(r); });
			years.forEach(function (y) {
				var open = !!openYears[y.y];
				h += '<tr class="mc-year" data-y="' + y.y + '" tabindex="0" role="button" aria-expanded="' + open + '"><td><span class="mc-caret">' + (open ? "&#9662;" : "&#9656;") + "</span> " + y.y + "</td><td>" + esc(money(y.pay)) + "</td><td>" + esc(money(y.prin)) + "</td><td>" + esc(money(y.int)) + "</td>" + (hasEx ? "<td>" + esc(money(y.ex)) + "</td>" : "") + "<td>" + esc(money(y.bal)) + "</td></tr>";
				if (open) y.rows.forEach(function (r) { h += rowHtml(r, "mc-sub", hasEx); });
			});
			var tp = 0, te = 0; rows.forEach(function (r) { tp += r.prin; te += r.ex; });
			h += "</tbody><tfoot><tr><td>Total</td><td>" + esc(money(s.paid)) + "</td><td>" + esc(money(tp)) + "</td><td>" + esc(money(s.interest)) + "</td>" + (hasEx ? "<td>" + esc(money(te)) + "</td>" : "") + "<td></td></tr></tfoot>";
			$("mc-sched-note").textContent = "Calendar years. Click a year to see its payments.";
			$("mc-sched").innerHTML = h; return;
		}
		$("mc-sched").innerHTML = h + "</tbody>";
	}

	/* ------------------------------------------------------------ compare + sensitivity */
	function renderCmp(c, inp) {
		var rB = MC.parseRate(st.cr), yB = MC.toNum(st.cy), fB = st.cf && MC.FREQ[st.cf] ? st.cf : "";
		var any = rB || yB > 0 || fB;
		$("mc-cmp-out").hidden = !any;
		var chips = [];
		var yrs = MC.toNum(st.years), rt = MC.toNum(st.rate);
		[15, 20, 30].forEach(function (y) { if (y !== yrs) chips.push('<button type="button" class="tu-chip" data-cy="' + y + '">' + y + "-year term</button>"); });
		if (rt != null) { chips.push('<button type="button" class="tu-chip" data-cr="' + Math.max(0, Math.round((rt - 1) * 1e4) / 1e4) + '">Rate −1%</button>'); chips.push('<button type="button" class="tu-chip" data-cr="' + Math.round((rt + 1) * 1e4) / 1e4 + '">Rate +1%</button>'); }
		if (st.freq === "monthly") chips.push('<button type="button" class="tu-chip" data-cf="accbiweekly">Accelerated bi-weekly</button>');
		chips.push('<button type="button" class="tu-chip" data-clear="1">Clear</button>');
		$("mc-cmp-chips").innerHTML = chips.join("");
		if (!any) return;
		var over = { freq: fB || inp.freq };
		if (rB) over.rate = rB;
		if (yB > 0 && yB <= 60) over.years = yB;
		var B = MC.mortgage(Object.assign({}, inp, over)), A = c, ppyA = A.ppy, ppyB = B.ppy;
		function row(label, a, b, diff, lowGood) {
			var cls = diff == null || diff === 0 || lowGood == null ? "" : ((diff < 0) === lowGood ? "tu-pos" : "tu-neg");
			return "<tr><td>" + label + "</td><td>" + a + "</td><td>" + b + "</td><td class=\"" + cls + '">' + (diff == null ? "" : (diff > 0 ? "+" : "") + (typeof diff === "string" ? diff : money(diff))) + "</td></tr>";
		}
		function mdiff(x) { return x === 0 ? "–" : (x > 0 ? "+" : "−") + money(Math.abs(x)); }
		var mA = Math.round(A.payment * ppyA / 12), mB = Math.round(B.payment * ppyB / 12);
		var h = "<thead><tr><th></th><th>A: current</th><th>B: scenario</th><th>B − A</th></tr></thead><tbody>";
		var ra = inp.rate.f, rbb = (over.rate || inp.rate).f;
		h += "<tr><td>Interest rate</td><td>" + ratef(ra) + "</td><td>" + ratef(rbb) + "</td><td></td></tr>";
		h += "<tr><td>Term</td><td>" + inp.years + " yrs</td><td>" + (over.years || inp.years) + " yrs</td><td></td></tr>";
		h += "<tr><td>Frequency</td><td>" + fname(inp.freq) + "</td><td>" + fname(over.freq) + "</td><td></td></tr>";
		h += row("Payment each time", esc(money(A.payment)), esc(money(B.payment)), null);
		h += row("Monthly equivalent", esc(money(mA)), esc(money(mB)), mB - mA, true);
		h += row("Total interest", esc(money(A.sched.interest)), esc(money(B.sched.interest)), B.sched.interest - A.sched.interest, true);
		h += row("Total of payments", esc(money(A.sched.paid)), esc(money(B.sched.paid)), B.sched.paid - A.sched.paid, true);
		h += "<tr><td>Mortgage-free</td><td>" + esc(monthYear(A.sched.payoff)) + "</td><td>" + esc(monthYear(B.sched.payoff)) + "</td><td>" + esc((B.sched.periods / ppyB - A.sched.periods / ppyA) === 0 ? "–" : Math.abs(Math.round((B.sched.periods / ppyB - A.sched.periods / ppyA) * 12)) + " months " + (B.sched.periods / ppyB < A.sched.periods / ppyA ? "sooner" : "later")) + "</td></tr>";
		h += "<tr><td>Interest per $1 borrowed</td><td>" + A.interestToPrincipal.toFixed(2) + "</td><td>" + B.interestToPrincipal.toFixed(2) + "</td><td></td></tr></tbody>";
		$("mc-cmp-table").innerHTML = h;
		var d = B.sched.interest - A.sched.interest;
		$("mc-cmp-note").textContent = "Scenario B " + (d < 0 ? "saves " : "costs ") + money(Math.abs(d)) + " in interest" + (mB !== mA ? " and its monthly equivalent payment is " + money(Math.abs(mB - mA)) + (mB > mA ? " higher." : " lower.") : ".") + " Leave a B field empty to keep A’s value.";
	}
	function renderSens(inp, c) {
		var deltas = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1], rows = MC.sensitivity(inp, deltas), h = "<thead><tr><th>Rate</th><th>Payment</th><th>Change</th><th>Total interest</th><th>Interest change</th></tr></thead><tbody>", cur = rows[4];
		rows.forEach(function (r) {
			var dp = r.pay - cur.pay, di = r.interest - cur.interest;
			h += '<tr class="' + (r.delta === 0 ? "is-active" : "") + '"><td>' + ratef(r.rate) + (r.delta === 0 ? " (yours)" : "") + "</td><td>" + esc(money(r.pay)) + "</td><td>" + (r.delta === 0 ? "" : '<span class="' + (dp < 0 ? "tu-pos" : "tu-neg") + '">' + (dp > 0 ? "+" : "−") + esc(money(Math.abs(dp))) + "</span>") + "</td><td>" + esc(money(r.interest)) + "</td><td>" + (r.delta === 0 ? "" : '<span class="' + (di < 0 ? "tu-pos" : "tu-neg") + '">' + (di > 0 ? "+" : "−") + esc(money(Math.abs(di))) + "</span>") + "</td></tr>";
		});
		$("mc-sens").innerHTML = h + "</tbody>";
	}

	/* ------------------------------------------------------------ affordability + payment -> loan */
	function renderAfford() {
		var bad = validCore();
		if (bad) return setEmpty(bad);
		var inc = MC.toCents(st.inc);
		if (!inc) return setEmpty("Enter your gross income per year to see what you can afford.");
		var inp = calcInput();
		var a = MC.afford({ region: st.r, income: inc, debts: MC.toCents(st.debts) || 0, down: MC.toCents(st.adp) || 0, rate: inp.rate, years: inp.years, fixed: inp.fixed, taxPct: inp.taxPct, ins: inp.ins, hoa: inp.hoa, pmiPct: inp.pmiPct, heat: MC.toCents(st.ht) || 0, condo: inp.hoa });
		setEmpty("");
		var ca = st.r === "ca", lim = a.limits;
		if (a.price == null) {
			$("mc-hero").innerHTML = tile("Affordable price", "–", "the fixed costs alone are over the limit", { hero: true });
			$("mc-hero-note").textContent = "";
			$("mc-side").hidden = false; $("mc-side-card").innerHTML = "<p style=\"margin:0;\">With this income, debt, tax, insurance and fee level there is nothing left for a mortgage inside the " + pctf(lim.f, 0) + " / " + pctf(lim.b, 0) + " guideline. Try less debt, lower tax / insurance figures, or a higher income.</p>";
			last = { c: null, sentence: "" }; return;
		}
		var down = MC.toCents(st.adp) || 0;
		var t = [];
		t.push(tile("You could afford a home up to", m0(a.price), "with " + m0(down) + " down" + (a.price ? " (" + pctf(down / a.price) + ")" : ""), { hero: true }));
		t.push(tile("Mortgage", m0(a.loan), a.premium ? "+ " + money(a.premium) + " insurance = " + money(a.financed) : "loan amount"));
		t.push(tile("Monthly housing cost", money(Math.round(a.housing)), ca ? "at the stress-test rate (" + ratef(a.qualRate) + ")" : "principal, interest, tax, insurance" + (a.pmi ? ", PMI" : "") + " and fees", { hero: true }));
		t.push(tile("Actual P&I payment", money(a.actualPi), "at your " + ratef(inp.rate.f) + " rate"));
		t.push(tile(ca ? "GDS ratio" : "Housing ratio", pctf(a.front), "limit " + pctf(lim.f, 0) + (a.bindingFront ? " – this is the limit that applies" : "")));
		t.push(tile(ca ? "TDS ratio" : "Debt-to-income", pctf(a.back), "limit " + pctf(lim.b, 0) + (!a.bindingFront ? " – this is the limit that applies" : "")));
		$("mc-hero").innerHTML = t.join("");
		$("mc-hero-note").textContent = "A guideline estimate based on your gross income of " + money(inc) + " a year. Click a tile to copy it.";
		var h = "<div class=\"tu-label\">How this was worked out</div><ol class=\"mc-steps\">";
		var gm = inc / 12;
		h += "<li>Gross monthly income: <b>" + money(Math.round(gm)) + "</b>.</li>";
		h += "<li>" + (ca ? "GDS" : "Housing") + " limit " + pctf(lim.f, 0) + ": housing costs up to <b>" + money(Math.round(lim.f * gm)) + "</b> a month.</li>";
		h += "<li>" + (ca ? "TDS" : "Total debt") + " limit " + pctf(lim.b, 0) + ": housing + other debts up to <b>" + money(Math.round(lim.b * gm)) + "</b>, minus your debts of " + money(MC.toCents(st.debts) || 0) + " leaves <b>" + money(Math.round(lim.b * gm - (MC.toCents(st.debts) || 0))) + "</b> for housing.</li>";
		h += "<li>The lower of the two, <b>" + money(Math.round(a.maxHousing)) + "</b>, is your housing budget" + (ca ? ", measured with the mortgage payment at the <b>stress-test rate " + ratef(a.qualRate) + "</b> (higher of your rate + 2% or 5.25%)" : "") + ". The price is the highest one whose total costs fit in it" + (ca ? ", with at least the legal minimum down payment" : "") + ".</li></ol>";
		h += "<p class=\"tu-note\">These ratios are common guidelines (" + (ca ? "CMHC&rsquo;s GDS 39% / TDS 44%" : st.r === "us" ? "the 28/36 rule" : "the generic 28/36 rule, which is not how lenders in your country assess you") + "). Lenders also weigh credit, savings and job history, and you may want to spend less than the maximum.</p>";
		h += "<div class=\"mc-btns\"><button type=\"button\" class=\"tu-btn tu-btn--primary\" id=\"mc-open-pay\">Open this in the payment calculator</button></div>";
		$("mc-side").hidden = false; $("mc-side-card").innerHTML = h;
		$("mc-open-pay").addEventListener("click", function () {
			st.m = "pay"; st.inp = "price"; st.price = cstr(a.price); st.du = "$"; st.dp = cstr(down);
			renderAll(); sync(); window.scrollTo({ top: $("mc").getBoundingClientRect().top + window.pageYOffset - 80, behavior: "smooth" });
		});
		last = { c: null, sentence: "With a gross income of " + money(inc) + ", " + money(MC.toCents(st.debts) || 0) + " of monthly debts and " + money(down) + " down, the " + (st.r === "us" ? "28/36" : ca ? "GDS/TDS 39/44" : "28/36") + " guideline suggests a home up to about " + money(a.price) + " (mortgage " + money(a.loan) + "). " + location.origin + "/mortgagecalculator" + shareQuery() };
	}
	function renderLoan() {
		var bad = validCore();
		if (bad) return setEmpty(bad);
		var tp = MC.toCents(st.tp);
		if (!tp) return setEmpty("Enter the payment you can afford to see the loan size.");
		var inp = calcInput(), tdp = MC.toCents(st.tdp);
		var x = MC.loanFromPayment({ region: st.r, payment: tp, rate: inp.rate, years: inp.years, freq: inp.freq, fixed: inp.fixed, down: tdp == null ? null : tdp });
		setEmpty("");
		var t = [];
		t.push(tile("Largest mortgage", money(x.maxLoan), "payments of " + money(tp) + " " + fname(inp.freq).toLowerCase() + " over " + inp.years + " years at " + ratef(inp.rate.f), { hero: true }));
		if (x.price != null) t.push(tile("Home price with your down payment", money(x.price), money(tdp) + " down + " + money(x.base) + " loan" + (x.premium ? " (+ " + money(x.premium) + " insurance in the mortgage)" : ""), { hero: true }));
		t.push(tile("Total paid over the loan", money(tp * Math.round(inp.years * MC.FREQ[inp.freq].ppy)), "about, if you pay the same amount every time"));
		$("mc-hero").innerHTML = t.join("");
		$("mc-hero-note").textContent = "Principal and interest only: property tax, insurance and fees are not included. Click a tile to copy it.";
		var h = "<p style=\"margin:0 0 0.6em;\">This is the loan that a payment of " + money(tp) + " can pay off exactly over the term. Want to see the schedule, charts and total interest for it?</p><div class=\"mc-btns\" style=\"margin-top:0;\"><button type=\"button\" class=\"tu-btn tu-btn--primary\" id=\"mc-open-pay2\">Open this loan in the payment calculator</button></div>";
		$("mc-side").hidden = false; $("mc-side-card").innerHTML = h;
		$("mc-open-pay2").addEventListener("click", function () {
			st.m = "pay"; st.inp = "loan"; st.loan = cstr(x.base + x.premium); st.price = x.price != null ? cstr(x.price) : st.price;
			if (st.r === "ca" && x.premium) { st.inp = "price"; st.du = "$"; st.dp = cstr(tdp); }
			renderAll(); sync(); window.scrollTo({ top: $("mc").getBoundingClientRect().top + window.pageYOffset - 80, behavior: "smooth" });
		});
		last = { c: null, sentence: "A payment of " + money(tp) + " " + fname(inp.freq).toLowerCase() + " over " + inp.years + " years at " + ratef(inp.rate.f) + " services a mortgage of about " + money(x.maxLoan) + ". " + location.origin + "/mortgagecalculator" + shareQuery() };
	}

	/* ------------------------------------------------------------ share links / old links / storage */
	var QMAP = [["r", "r"], ["cur", "cur"], ["m", "m"], ["inp", "in"], ["price", "p"], ["dp", "dp"], ["du", "du"], ["loan", "ln"], ["rate", "i"], ["rt", "rt"], ["years", "y"], ["freq", "f"], ["sd", "sd"],
		["tax", "tx"], ["ins", "ins"], ["hoa", "hoa"], ["pmi", "pmi"], ["ht", "ht"], ["bal", "bal"], ["ukt", "ukt"], ["xm", "xm"], ["xy", "xy"], ["xl", "xl"], ["xd", "xd"], ["ry", "ry"], ["rr", "rr"],
		["inc", "inc"], ["debts", "debt"], ["adp", "adp"], ["tp", "tp"], ["tdp", "tdp"], ["cr", "cr"], ["cy", "cy"], ["cf", "cf"]];
	var QBOOL = [["ftb", "ftb"], ["sdlt", "sdlt"], ["sf", "sf"], ["sa", "sa"], ["rs", "rs"]];
	function shareQuery() {
		var p = [];
		function add(k, v) { if (v !== "" && v != null) p.push(k + "=" + encodeURIComponent(v)); }
		QMAP.forEach(function (x) {
			var v = st[x[0]];
			if (x[0] === "du") { if (v === "$") add("du", "d"); return; }
			if (x[0] === "inp") { if (v === "loan") add("in", "loan"); return; }
			if (x[0] === "m") { if (v !== "pay") add("m", v); return; }
			if (x[0] === "rt") { if (v === "var") add("rt", "v"); return; }
			if (x[0] === "freq") { if (v !== "monthly") add("f", v); return; }
			if (x[0] === "ukt") { if (v === "io") add("ukt", "io"); return; }
			if (x[0] === "ry" && !st.rs && st.r !== "ca") return;
			if (x[0] === "sd" && v === today()) return;
			add(x[1], typeof v === "string" ? v.trim() : v);
		});
		QBOOL.forEach(function (x) { if (st[x[0]]) add(x[1], "1"); });
		return p.length ? "?" + p.join("&") : "";
	}
	function fromQuery(q) {
		var any = false, o = {};
		QMAP.concat(QBOOL).forEach(function (x) { if (q.has(x[1])) any = true; });
		if (!any) return null;
		QMAP.forEach(function (x) { if (q.has(x[1])) o[x[0]] = q.get(x[1]).slice(0, 40); });
		QBOOL.forEach(function (x) { if (q.has(x[1])) o[x[0]] = q.get(x[1]) === "1"; });
		if (o.du === "d") o.du = "$"; else delete o.du;
		if (o["inp"] === "loan") o.inp = "loan"; else delete o.inp;
		if (o.rt === "v") o.rt = "var"; else if (o.rt) o.rt = "fixed";
		if (o.ukt !== "io") delete o.ukt;
		return o;
	}
	function normalise() {
		if (!REG[st.r]) st.r = "us";
		if (!/^(pay|afford|loan)$/.test(st.m)) st.m = "pay";
		if (st.inp !== "loan") st.inp = "price";
		if (st.du !== "$") st.du = "%";
		if (!MC.FREQ[st.freq]) st.freq = "monthly";
		if (st.cf && !MC.FREQ[st.cf]) st.cf = "";
		if (st.rt !== "var") st.rt = "fixed";
		if (st.ukt !== "io") st.ukt = "repay";
		if (st.vw !== "all") st.vw = "year";
		if (st.cur && !/^[A-Z]{3}$/.test(st.cur)) st.cur = "";
		if (st.cur && ["USD", "CAD", "GBP", "AUD", "NZD", "EUR", "CHF", "SGD", "INR", "ZAR"].indexOf(st.cur) < 0) st.cur = "";
		["ftb", "sdlt", "sf", "sa", "rs"].forEach(function (k) { st[k] = !!st[k]; });
		if (!MC.parseDate(st.sd)) st.sd = today();
		if (st.xd && !MC.parseDate(st.xd)) st.xd = "";
		for (var k in DEF) if (typeof st[k] !== typeof DEF[k]) st[k] = DEF[k];
	}
	function sync() {
		try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
		try { history.replaceState(null, "", (/^\/mortgagecalculator\/s\//.test(location.pathname) ? "/mortgagecalculator" : location.pathname) + shareQuery()); } catch (e) {}
	}
	function applyRegion(nr, old) {
		PRESET_KEYS.forEach(function (k) {
			if (old === undefined || st[k] === REG[old][k] || st[k] === "" || st[k] == null) st[k] = REG[nr][k] != null ? REG[nr][k] : st[k];
		});
		st.r = nr;
		if (nr !== "ca") st.rt = "fixed";
		if (nr === "uk") { st.cur = st.cur === REG[old || "us"].cur ? REG.uk.cur : st.cur; }
	}
	function detectRegion() {
		var m = /-([A-Za-z]{2})(?:$|-)/.exec(LOC), c = m ? m[1].toUpperCase() : "";
		return c === "CA" ? "ca" : c === "GB" ? "uk" : c === "AU" ? "au" : "us";
	}
	/* old 2013 /mortgagecalculator/s/<id> links: {value, dp-percent, loan (term in years), date ("October-2026"), rate, tax, pmi, pmi-months, balloon} */
	var MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
	function oldDate(s) {
		var m = /^([A-Za-z]+)[\s\-]+(\d{4})$/.exec(String(s || "").trim());
		if (!m) return "";
		var i = MONTHS.indexOf(m[1].toLowerCase()); if (i < 0) i = MONTHS.map(function (x) { return x.slice(0, 3); }).indexOf(m[1].toLowerCase().slice(0, 3));
		return i < 0 ? "" : m[2] + "-" + ("0" + (i + 1)).slice(-2) + "-01";
	}
	function fromOldShare(d) {
		if (typeof d === "string") { try { d = JSON.parse(d); } catch (e) { return null; } }
		if (!d || d.value == null || d.rate == null) return null;
		function n(x) { var v = Number(x); return isFinite(v) && v >= 0 ? String(v) : ""; }
		var o = { r: "us", cur: "USD", m: "pay", inp: "price", price: n(d.value), du: "%", dp: n(d["dp-percent"]), years: n(d.loan), rate: n(d.rate), tax: n(d.tax), pmi: n(d.pmi), bal: n(d.balloon) === "0" ? "" : n(d.balloon), ins: "0", hoa: "0", freq: "monthly" };
		var sd = oldDate(d.date); if (sd) o.sd = sd;
		return MC.toCents(o.price) && MC.parseRate(o.rate) ? o : null;
	}
	function loadOld(id) {
		notice("Loading the calculation from your shared link…");
		var f = window.fetch ? window.fetch("/api/share?calc=mc&id=" + encodeURIComponent(id)).then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); }) : Promise.reject(new Error("no fetch"));
		return f.then(function (d) {
			var o = fromOldShare(d);
			if (!o) throw new Error("bad data");
			for (var k in o) st[k] = o[k];
			normalise(); renderAll(); sync(); notice("");
			history.replaceState(null, "", "/mortgagecalculator" + shareQuery());
			toast("Shared calculation loaded");
		}).catch(function () {
			notice("That old shared link could not be loaded (it may have expired). Here is a fresh calculator &mdash; enter your numbers above.");
		});
	}
	function notice(html) { var n = $("mc-notice"); n.innerHTML = html || ""; n.hidden = !html; }

	/* ------------------------------------------------------------ toast + copy */
	function toast(msg) {
		var t = $("mc-toast");
		if (!t) { t = document.createElement("div"); t.id = "mc-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show");
		clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1500);
	}
	function copy(text, msg) {
		function fallback() {
			var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0";
			document.body.appendChild(ta); ta.select();
			try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); }
			document.body.removeChild(ta);
		}
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fallback); else fallback();
	}

	/* ------------------------------------------------------------ render all */
	function update() {
		summaries(); dphint();
		if (st.m === "afford") renderAfford(); else if (st.m === "loan") renderLoan(); else renderPay();
		// result visibility depends on the mode
		$("mc-payres").hidden = st.m !== "pay" || !$("mc-empty").hidden;
		sync();
	}
	function renderAll() { normalise(); writeControls(); update(); }
	function dphint() {
		var price = MC.toCents(st.price), el = $("mc-dphint");
		if (!price) { el.textContent = ""; return; }
		if (st.du === "%") { var p = MC.parseRate(st.dp); el.textContent = p ? "= " + money(Math.round(price * Number(p.n) / Number(p.d) / 100)) : ""; }
		else { var d = MC.toCents(st.dp); el.textContent = d != null ? "= " + (d / price * 100).toFixed(1) + "% of the price" : ""; }
	}

	/* ------------------------------------------------------------ init */
	function init() {
		for (var k in DEF) st[k] = DEF[k];
		buildStatic();
		var saved = null;
		try { saved = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
		var q = new URLSearchParams(location.search), fromUrl = fromQuery(q);
		if (fromUrl) {
			var r0 = fromUrl.r && REG[fromUrl.r] ? fromUrl.r : "us";
			applyRegion(r0, undefined);
			for (var key in fromUrl) st[key] = fromUrl[key];
			if (!fromUrl.cur) st.cur = REG[r0].cur;
		} else if (saved && typeof saved === "object") {
			applyRegion(REG[saved.r] ? saved.r : "us", undefined);
			for (var s in saved) if (s in DEF) st[s] = saved[s];
		} else applyRegion(detectRegion(), undefined);
		st.sd = (fromUrl && fromUrl.sd) || today();   // the start date is always "today" unless a link says otherwise
		normalise();
		["mc-d-costs", "mc-d-extra", "mc-d-reset", "mc-d-region", "mc-d-bal"].forEach(function (id) { });
		if (st.xm || st.xy || st.xl) $("mc-d-extra").open = true;
		if (st.rs) $("mc-d-reset").open = true;
		if (st.bal) $("mc-d-bal").open = true;
		if (st.ftb || st.sdlt || st.ukt === "io") $("mc-d-region").open = true;
		if (MC.toCents(st.ins) || MC.toCents(st.hoa) || (MC.parseRate(st.tax) && MC.parseRate(st.tax).n > 0n) || st.m === "afford") $("mc-d-costs").open = true;
		var m = location.pathname.match(/^\/mortgagecalculator\/s\/([A-Za-z0-9]+)\/?$/);
		renderAll(); dphint();
		if (m && !fromUrl) loadOld(m[1]);

		var keys = { "mc-price": "price", "mc-dp": "dp", "mc-loan": "loan", "mc-rate": "rate", "mc-years": "years", "mc-tax": "tax", "mc-ins": "ins", "mc-hoa": "hoa", "mc-pmi": "pmi", "mc-ht": "ht", "mc-bal": "bal",
			"mc-xm": "xm", "mc-xy": "xy", "mc-xl": "xl", "mc-xd": "xd", "mc-ry": "ry", "mc-rr": "rr", "mc-inc": "inc", "mc-debts": "debts", "mc-adp": "adp", "mc-tp": "tp", "mc-tdp": "tdp", "mc-cr": "cr", "mc-cy": "cy", "mc-start": "sd" };
		Object.keys(keys).forEach(function (id) {
			var ev = $(id).type === "date" ? "change" : "input";
			$(id).addEventListener(ev, function () {
				st[keys[id]] = this.value;
				if (id === "mc-years") [].forEach.call($("mc-yrchips").children, function (b) { b.setAttribute("aria-pressed", String(String(MC.toNum(st.years)) === b.getAttribute("data-y"))); });
				dphint(); update();
			});
		});
		$("mc-cur").addEventListener("change", function () { st.cur = this.value; mkfmt(); symTag(); $("mc-dp-tag").textContent = st.du === "%" ? "%" : sym(); update(); dphint(); });
		$("mc-freq").addEventListener("change", function () { st.freq = this.value; writeControls(); update(); });
		$("mc-cf").addEventListener("change", function () { st.cf = this.value; update(); });
		$("mc-rt").addEventListener("change", function () { st.rt = this.value; update(); });
		$("mc-ukt").addEventListener("change", function () { st.ukt = this.value; update(); });
		[["mc-ftb30", "ftb"], ["mc-sdlt", "sdlt"], ["mc-sf", "sf"], ["mc-sa", "sa"], ["mc-rs", "rs"]].forEach(function (x) {
			$(x[0]).addEventListener("change", function () { st[x[1]] = this.checked; writeControls(); update(); });
		});
		$("mc-region").addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			var nr = b.getAttribute("data-v"); if (nr === st.r) return;
			var old = st.r; applyRegion(nr, old); st.ftb = false; st.sdlt = false; st.ukt = "repay";
			renderAll(); dphint();
		});
		$("mc-mode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { st.m = b.getAttribute("data-v"); renderAll(); dphint(); } });
		$("mc-inp").addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			var v = b.getAttribute("data-v");
			if (v === "loan" && st.inp !== "loan" && !st.loan) { var c = last && last.c; if (c) st.loan = MC.fixed(c.financed - c.premium); }
			st.inp = v; renderAll(); dphint();
		});
		$("mc-dpu").addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			var v = b.getAttribute("data-v"); if (v === st.du) return;
			var price = MC.toCents(st.price);
			if (price) {   // keep the same down payment: convert the number
				if (v === "$") { var p = MC.parseRate(st.dp); if (p) st.dp = cstr(Math.round(price * Number(p.n) / Number(p.d) / 100)); }
				else { var d = MC.toCents(st.dp); if (d != null) st.dp = String(Math.round(d / price * 1e5) / 1e3); }
			}
			st.du = v; renderAll(); dphint();
		});
		$("mc-vw").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { st.vw = b.getAttribute("data-v"); setPressed($("mc-vw"), st.vw); if (last && last.c) renderSched(last.c); sync(); } });
		$("mc-yrchips").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { st.years = b.getAttribute("data-y"); $("mc-years").value = st.years; writeControls(); update(); } });
		$("mc-sched").addEventListener("click", function (e) {
			var tr = e.target.closest("tr.mc-year"); if (!tr) return;
			var y = tr.getAttribute("data-y"); openYears[y] = !openYears[y]; if (last && last.c) renderSched(last.c);
		});
		$("mc-sched").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { var tr = e.target.closest("tr.mc-year"); if (tr) { e.preventDefault(); tr.click(); } } });
		$("mc-cmp-chips").addEventListener("click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			if (b.hasAttribute("data-clear")) { st.cr = st.cy = st.cf = ""; }
			if (b.hasAttribute("data-cy")) st.cy = b.getAttribute("data-cy");
			if (b.hasAttribute("data-cr")) st.cr = b.getAttribute("data-cr");
			if (b.hasAttribute("data-cf")) st.cf = b.getAttribute("data-cf");
			writeControls(); update();
		});
		function tileCopy(t) { if (t) copy(t.getAttribute("data-copy"), "Copied " + t.getAttribute("data-copy")); }
		["mc-hero", "mc-extra-stats"].forEach(function (id) {
			$(id).addEventListener("click", function (e) { tileCopy(e.target.closest(".mc-tile")); });
			$(id).addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { var t = e.target.closest(".mc-tile"); if (t) { e.preventDefault(); tileCopy(t); } } });
		});
		function link() { copy(location.origin + "/mortgagecalculator" + shareQuery(), "Link copied"); }
		function reset() {
			var r = st.r, cur = st.cur, mode = st.m; for (var k in DEF) st[k] = DEF[k];
			applyRegion(r, undefined); st.cur = cur; st.m = mode; st.sd = today(); openYears = {};
			renderAll(); dphint();
		}
		$("mc-link").addEventListener("click", link); $("mc-link2").addEventListener("click", link);
		$("mc-print").addEventListener("click", function () { window.print(); }); $("mc-print2").addEventListener("click", function () { window.print(); });
		$("mc-reset").addEventListener("click", reset); $("mc-reset2").addEventListener("click", reset);
		$("mc-sent").addEventListener("click", function () { if (last) copy(last.sentence, "Sentence copied"); });
		$("mc-csv").addEventListener("click", function () { if (last && last.c) copy(csvText(last.c), "Schedule copied as CSV"); });
		$("mc-sent2").addEventListener("click", function () { if (last) copy(last.sentence, "Sentence copied"); });
	}
	init();
})();
