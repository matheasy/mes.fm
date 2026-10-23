/* MES Compound Interest + Loan Calculators -- the maths (global `MG`, also require()-able in node: tool_apps_src/money-growth-tests.js).
 * Savings growth: a step-by-step simulation (one step per deposit period, or per month) with the growth factor of each step derived from the
 * effective annual rate of the chosen compounding, so every compounding / deposit-frequency mix is consistent; amounts are doubles and
 * rounded to the cent only for display (like the textbook formula A = P(1 + r/n)^(nt), which it reproduces exactly).
 * Loans: whole CENTS. The rate is parsed from the typed decimal string into an exact rational, so the interest of every payment is
 * computed with exact integer arithmetic (nominal annual rate / payments per year, rounded half up to the cent); the payment comes from the
 * annuity formula rounded to the cent and the final payment clears whatever is left, so every schedule ends at exactly 0.00. */
(function (root) {
	"use strict";

	/* ------------------------------------------------------------------ number parsing (1,234.56 / 1.234,56 / 1 234,56 / $5,000) */
	function parseDec(str) {
		if (str == null) return null;
		var s = String(str).trim().replace(/[\s  '’_]/g, "").replace(/[^\d.,+\-−]/g, "").replace(/−/g, "-");
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
	function toCents(str) {     // typed money -> integer cents (half up); null if blank / negative / nonsense
		var d = parseDec(str); if (!d || d.neg) return null;
		var f = (d.fp + "000").slice(0, 3), c = BigInt(d.ip || "0") * 100n + BigInt(f.slice(0, 2));
		if (f.charAt(2) >= "5") c += 1n;
		var n = Number(c); return isFinite(n) && n <= 1e15 ? n : null;
	}
	function parseRate(str) {   // typed percent -> {n, d (BigInt): exact n/d percent, f: double percent}
		var d = parseDec(str); if (!d || d.neg) return null;
		if ((d.ip || "0").length > 6 || d.fp.length > 12) return null;
		return { n: BigInt((d.ip || "0") + d.fp), d: 10n ** BigInt(d.fp.length), f: Number((d.ip || "0") + "." + (d.fp || "0")) };
	}
	function rateOf(pct) { return parseRate(String(Math.round(pct * 1e9) / 1e9)); }

	/* ------------------------------------------------------------------ savings: compounding, deposits */
	var COMP = { daily: 365, monthly: 12, quarterly: 4, semiannual: 2, annual: 1, continuous: 0 };
	var COMP_LABEL = { daily: "Daily", monthly: "Monthly", quarterly: "Quarterly", semiannual: "Semi-annually", annual: "Annually", continuous: "Continuously" };
	var DFREQ = { weekly: 52, biweekly: 26, monthly: 12, quarterly: 4, yearly: 1 };
	var DFREQ_LABEL = { none: "No deposits", weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };
	var DFREQ_PER = { weekly: "week", biweekly: "2 weeks", monthly: "month", quarterly: "quarter", yearly: "year" };

	// effective annual rate (APY) of a nominal annual rate r (decimal) compounded `comp`
	function apy(r, comp) {
		var n = COMP[comp];
		if (n === 0) return Math.expm1(r);
		return Math.expm1(Math.log1p(r / n) * n);
	}
	// growth of one step when there are `spy` steps per year
	function stepGrowth(r, comp, spy) {
		var n = COMP[comp];
		if (n === 0) return Math.expm1(r / spy);
		return Math.expm1(Math.log1p(r / n) * n / spy);
	}

	// o: {start, dep, df ("none"|DFREQ key), timing ("s" = start of period | "e" = end), rate (decimal), comp, years, months,
	//     inc (decimal, deposit increase per year), inf (decimal, inflation), tax (decimal, tax on interest as it is earned)}
	function grow(o) {
		var df = o.df && DFREQ[o.df] ? o.df : "none";
		var weekly = df === "weekly" || df === "biweekly";
		var spy = weekly ? DFREQ[df] : 12;
		var every = weekly ? 1 : (df === "none" ? 0 : 12 / DFREQ[df]);
		var years = Math.max(0, Math.floor(o.years || 0)), months = Math.max(0, Math.round(o.months || 0));
		var N = weekly ? years * spy + Math.round(months / 12 * spy) : years * 12 + months;
		var g = stepGrowth(o.rate || 0, o.comp || "monthly", spy), tax = Math.min(1, Math.max(0, o.tax || 0));
		var bal = o.start || 0, deps = bal, intr = 0, taxed = 0, dep = o.dep || 0, inc = o.inc || 0;
		var steps = [], k;
		for (k = 0; k < N; k++) {
			if (k > 0 && k % spy === 0) dep *= 1 + inc;
			var isDep = every > 0 && (o.timing === "s" ? k % every === 0 : (k + 1) % every === 0), d = 0;
			if (isDep && o.timing === "s") { bal += dep; deps += dep; d = dep; }
			var raw = bal * g, t = raw * tax, i = raw - t;
			bal += i; intr += i; taxed += t;
			if (isDep && o.timing !== "s") { bal += dep; deps += dep; d = dep; }
			steps.push({ k: k + 1, t: (k + 1) / spy, bal: bal, deps: deps, intr: intr, tax: taxed, d: d, i: i });
		}
		var T = N / spy, inf = o.inf || 0, defl = Math.pow(1 + inf, T);
		// year rows
		var yrs = [], y, prev = { bal: o.start || 0, deps: o.start || 0, intr: 0, tax: 0 };
		for (y = 0; y * spy < N; y++) {
			var last = steps[Math.min(N, (y + 1) * spy) - 1];
			yrs.push({ y: y + 1, t: last.t, from: y * spy, to: Math.min(N, (y + 1) * spy), dep: last.deps - prev.deps, int: last.intr - prev.intr, tax: last.tax - prev.tax,
				bal: last.bal, deps: last.deps, intr: last.intr, real: last.bal / Math.pow(1 + inf, last.t) });
			prev = last;
		}
		return { steps: steps, years: yrs, spy: spy, N: N, T: T, start: o.start || 0, final: bal, deposits: deps, interest: intr, tax: taxed,
			real: bal / defl, apy: apy(o.rate || 0, o.comp || "monthly"), df: df, lastDep: dep };
	}
	// closed-form future value for checking (no increase, no tax): P(1+g)^N + D * ((1+g)^N - 1)/g [* (1+g) for start-of-period]
	function fvClosed(P, D, g, N, every, start) {
		var G = Math.pow(1 + g, every), m = Math.floor(N / every), F = Math.pow(1 + g, N);
		if (!D) return P * F;
		var ann = g === 0 ? m : (Math.pow(G, m) - 1) / (G - 1);
		return P * F + D * ann * (start ? G : 1);
	}

	/* goal solvers ------------------------------------------------------------- */
	function copy(o, extra) { var r = {}, k; for (k in o) r[k] = o[k]; for (k in extra) r[k] = extra[k]; return r; }
	// deposit per period that reaches `target` (linear in the deposit). null = no deposit frequency
	function solveDeposit(o, target) {
		var df = o.df && DFREQ[o.df] ? o.df : "monthly";
		var f0 = grow(copy(o, { dep: 0, df: df })).final, f1 = grow(copy(o, { start: 0, dep: 1, df: df })).final;
		if (f0 >= target) return { dep: 0, reached: true, df: df };
		if (!(f1 > 0)) return null;
		return { dep: (target - f0) / f1, reached: false, df: df };
	}
	// time until the balance first reaches `target` (cap 200 years). {steps, t (years), years, months} or null
	function solveTime(o, target) {
		if ((o.start || 0) >= target) return { steps: 0, t: 0, years: 0, months: 0 };
		var r = grow(copy(o, { years: 200, months: 0 })), s = r.steps, lo = 0, hi = s.length - 1;
		if (!s.length || s[hi].bal < target) return null;
		while (lo < hi) { var mid = (lo + hi) >> 1; if (s[mid].bal >= target) hi = mid; else lo = mid + 1; }
		var t = s[lo].t, mo = Math.round(t * 12);
		return { steps: lo + 1, t: t, years: Math.floor(mo / 12), months: mo % 12, spy: r.spy };
	}
	// annual rate (decimal) needed to reach `target`; null if over 100%
	function solveRate(o, target) {
		var f = function (r) { return grow(copy(o, { rate: r })).final; };
		if (f(0) >= target) return 0;
		if (f(1) < target) return null;
		var lo = 0, hi = 1;
		for (var i = 0; i < 60; i++) { var mid = (lo + hi) / 2; if (f(mid) >= target) hi = mid; else lo = mid; }
		return (lo + hi) / 2;
	}

	/* rule of 72 ------------------------------------------------------------------ */
	function doubling(r, comp) { var e = apy(r, comp || "annual"); return e > 0 ? Math.LN2 / Math.log1p(e) : Infinity; }
	function rule72(pct) { return 72 / pct; }
	function rule69(pct) { return 69.3 / pct + 0.35; }   // the "69.3 rule" with its usual 0.35 correction (very good for continuous compounding)

	/* ------------------------------------------------------------------ loans */
	var FREQ = {
		weekly: { ppy: 52, label: "Weekly", per: "week" },
		biweekly: { ppy: 26, label: "Every 2 weeks", per: "2 weeks" },
		semimonthly: { ppy: 24, label: "Twice a month", per: "half-month" },
		monthly: { ppy: 12, label: "Monthly", per: "month" },
		quarterly: { ppy: 4, label: "Quarterly", per: "quarter" },
		annual: { ppy: 1, label: "Yearly", per: "year" }
	};
	// periodic rate: nominal annual rate / payments per year, interest rounded half up with exact integers
	function periodic(rp, ppy) {
		if (!rp || rp.n === 0n) return { f: 0, int: function () { return 0; } };
		var den = rp.d * 100n * BigInt(ppy), num = rp.n;
		return { f: Number(num) / Number(den), int: function (b) { return Number((BigInt(b) * num * 2n + den) / (2n * den)); } };
	}
	function pmt(L, f, n) {     // level payment (cents)
		if (n <= 0) return L;
		if (L <= 0) return 0;
		if (f === 0) return Math.round(L / n);
		var g = Math.log1p(f) * n;
		return Math.round(L * f / (-Math.expm1(-g)));
	}
	function pv(P, f, n) {      // the loan a payment can repay over n periods (cents, rounded down so the payment never exceeds P)
		if (n <= 0 || P <= 0) return 0;
		if (f === 0) return P * n;
		var L = Math.floor(P * (-Math.expm1(-Math.log1p(f) * n)) / f);
		while (L > 0 && pmt(L, f, n) > P) L--;
		return L;
	}
	/* dates */
	function dim(y, m0) { return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate(); }
	function addMonths(s, k) { var m0 = s.m - 1 + k, y = s.y + Math.floor(m0 / 12), mm = ((m0 % 12) + 12) % 12; return { y: y, m: mm + 1, d: Math.min(s.d, dim(y, mm)) }; }
	function addDays(s, k) { var t = new Date(Date.UTC(s.y, s.m - 1, s.d + k)); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
	function dateAt(s, k, freq) {   // date of payment k (1 = first payment, one period after the start date)
		var ppy = FREQ[freq].ppy;
		if (ppy === 12) return addMonths(s, k);
		if (ppy === 4) return addMonths(s, 3 * k);
		if (ppy === 1) return addMonths(s, 12 * k);
		if (ppy === 24) { var b = addMonths(s, Math.floor(k / 2)); return k % 2 ? addDays(b, 15) : b; }
		return addDays(s, (ppy === 26 ? 14 : 7) * k);
	}
	function parseDate(str) {
		var m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(str || "").trim());
		if (!m) return null;
		var y = +m[1], mo = +m[2], d = +m[3];
		if (y < 1900 || y > 2200 || mo < 1 || mo > 12 || d < 1 || d > dim(y, mo - 1)) return null;
		return { y: y, m: mo, d: d };
	}
	function isoDate(d) { return d.y + "-" + ("0" + d.m).slice(-2) + "-" + ("0" + d.d).slice(-2); }
	function nPayments(years, months, ppy) { return Math.round(((years || 0) * 12 + (months || 0)) / 12 * ppy); }

	// o: {loan (cents), rate (parsed), freq, n, start {y,m,d}, pay (cents, optional override), extra (cents per payment), lump: {amount, at (payment no.)}}
	function schedule(o) {
		var F = FREQ[o.freq] || FREQ.monthly, ppy = F.ppy, n = o.n, L = o.loan;
		var per = periodic(o.rate, ppy), pay = o.pay != null ? o.pay : pmt(L, per.f, n);
		var rows = [], bal = L, k, interest = 0, paidTotal = 0, neg = false;
		var lump = o.lump && o.lump.amount > 0 ? o.lump : null;
		for (k = 1; k <= n && bal > 0; k++) {
			var bb = bal, intr = per.int(bb), due, extra = 0, prin;
			if (k === n || bb + intr <= pay) due = bb + intr;
			else {
				due = pay;
				if (pay <= intr) neg = true;
				extra = (o.extra || 0) + (lump && lump.at === k ? lump.amount : 0);
				if (extra > bb + intr - due) extra = Math.max(0, bb + intr - due);
			}
			prin = due + extra - intr;
			bal = bb - prin;
			interest += intr; paidTotal += due + extra;
			rows.push({ k: k, d: o.start ? dateAt(o.start, k, o.freq) : null, bb: bb, pay: due + extra, int: intr, prin: prin, ex: extra, bal: bal });
			if (neg) break;
		}
		return { rows: rows, pay: pay, ppy: ppy, n: n, loan: L, interest: interest, paid: paidTotal, periods: rows.length, neg: neg,
			payoff: rows.length ? rows[rows.length - 1].d : o.start, freq: o.freq || "monthly", f: per.f };
	}
	// group payments by loan year (payments 1..ppy = year 1)
	function yearRows(s) {
		var out = [], i, cur = null;
		for (i = 0; i < s.rows.length; i++) {
			var r = s.rows[i], y = Math.floor((r.k - 1) / s.ppy) + 1;
			if (!cur || cur.y !== y) { cur = { y: y, first: i, last: i, pay: 0, int: 0, prin: 0, ex: 0, bal: 0, d0: r.d, d1: r.d }; out.push(cur); }
			cur.last = i; cur.pay += r.pay; cur.int += r.int; cur.prin += r.prin; cur.ex += r.ex; cur.bal = r.bal; cur.d1 = r.d;
		}
		return out;
	}
	function durationText(periods, ppy) {
		var months = Math.round(periods / ppy * 12), y = Math.floor(months / 12), m = months % 12, a = [];
		if (y) a.push(y + (y === 1 ? " year" : " years"));
		if (m) a.push(m + (m === 1 ? " month" : " months"));
		return a.join(" ") || (periods > 0 ? "under a month" : "0 months");
	}
	// APR: the yearly rate (nominal, payments per year) at which the payments are worth exactly what you actually received (`net`).
	// payments: array of cents (payment 1, 2, ...). Returns {periodic, apr (decimal), ear} or null.
	function aprOf(payments, net, ppy) {
		var pvAt = function (i) { var s = 0, v = 1, k; for (k = 0; k < payments.length; k++) { v /= 1 + i; s += payments[k] * v; } return s; };
		var total = 0, k; for (k = 0; k < payments.length; k++) total += payments[k];
		if (!payments.length || net <= 0) return null;
		if (total <= net) return { periodic: 0, apr: 0, ear: 0, below: total < net };
		var lo = 0, hi = 0.05;
		while (pvAt(hi) > net && hi < 10) hi *= 2;
		if (pvAt(hi) > net) return null;
		for (var it = 0; it < 200; it++) { var mid = (lo + hi) / 2; if (pvAt(mid) > net) lo = mid; else hi = mid; if (hi - lo < 1e-15) break; }
		var p = (lo + hi) / 2;
		return { periodic: p, apr: p * ppy, ear: Math.expm1(Math.log1p(p) * ppy) };
	}

	/* ------------------------------------------------------------------ presets (typical example numbers, not offers) */
	var LOAN_PRESETS = {
		car: { name: "Car loan", amount: "30000", rate: "6.9", years: "5", months: "0", freq: "monthly", fee: "0" },
		personal: { name: "Personal loan", amount: "10000", rate: "12", years: "3", months: "0", freq: "monthly", fee: "300" },
		student: { name: "Student loan", amount: "35000", rate: "6.5", years: "10", months: "0", freq: "monthly", fee: "0" },
		small: { name: "Small loan", amount: "2000", rate: "18", years: "1", months: "0", freq: "monthly", fee: "50" }
	};

	var MG = { parseDec: parseDec, toNum: toNum, toCents: toCents, parseRate: parseRate, rateOf: rateOf,
		COMP: COMP, COMP_LABEL: COMP_LABEL, DFREQ: DFREQ, DFREQ_LABEL: DFREQ_LABEL, DFREQ_PER: DFREQ_PER,
		apy: apy, stepGrowth: stepGrowth, grow: grow, fvClosed: fvClosed, solveDeposit: solveDeposit, solveTime: solveTime, solveRate: solveRate,
		doubling: doubling, rule72: rule72, rule69: rule69,
		FREQ: FREQ, periodic: periodic, pmt: pmt, pv: pv, addMonths: addMonths, addDays: addDays, dateAt: dateAt, parseDate: parseDate, isoDate: isoDate,
		nPayments: nPayments, schedule: schedule, yearRows: yearRows, durationText: durationText, aprOf: aprOf, LOAN_PRESETS: LOAN_PRESETS };
	if (typeof module !== "undefined" && module.exports) module.exports = MG;
	else root.MG = MG;
})(this);
