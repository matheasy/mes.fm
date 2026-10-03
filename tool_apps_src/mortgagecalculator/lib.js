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
