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

	/* ------------------------------------------------------------------ chart sliders ("Try other numbers on the chart") */
	function niceCeil(x) {      // smallest 1 / 2 / 2.5 / 5 x 10^k that is >= x
		if (!(x > 0)) return 1;
		var mag = Math.pow(10, Math.floor(Math.log10(x))), m = [1, 2, 2.5, 5, 10];
		for (var i = 0; i < m.length; i++) if (m[i] * mag >= x * (1 - 1e-12)) return m[i] * mag;
		return 10 * mag;
	}
	// slider range for one input, given the number typed in the form; the typed value always fits with room to spare
	function sliderRange(kind, typed) {
		var v = typed > 0 ? typed : 0, max;
		if (kind === "start") { max = niceCeil(Math.max(50000, v * 3)); return { min: 0, max: max, step: max / 500 }; }
		if (kind === "dep") { max = niceCeil(Math.max(1000, v * 3)); return { min: 0, max: max, step: max / 500 }; }
		if (kind === "rate") { max = Math.min(100, Math.max(15, Math.ceil(v * 2))); return { min: 0, max: max, step: 0.05 }; }
		if (kind === "years") { max = Math.min(100, Math.max(40, Math.ceil(v * 2))); return { min: 1, max: max, step: 1 }; }
		return null;
	}
	// a slider position snapped to its step (and range); money to the cent, the rate to 2 decimals
	function snapSlider(kind, x, rg) {
		var v = Math.min(rg.max, Math.max(rg.min, +x || 0));
		v = Math.round(v / rg.step) * rg.step;
		return kind === "rate" ? Math.round(v * 100) / 100 : kind === "years" ? Math.round(v) : Math.round(v * 100) / 100;
	}

	var MG = { parseDec: parseDec, toNum: toNum, toCents: toCents, parseRate: parseRate, rateOf: rateOf,
		COMP: COMP, COMP_LABEL: COMP_LABEL, DFREQ: DFREQ, DFREQ_LABEL: DFREQ_LABEL, DFREQ_PER: DFREQ_PER,
		apy: apy, stepGrowth: stepGrowth, grow: grow, fvClosed: fvClosed, solveDeposit: solveDeposit, solveTime: solveTime, solveRate: solveRate,
		doubling: doubling, rule72: rule72, rule69: rule69, niceCeil: niceCeil, sliderRange: sliderRange, snapSlider: snapSlider,
		FREQ: FREQ, periodic: periodic, pmt: pmt, pv: pv, addMonths: addMonths, addDays: addDays, dateAt: dateAt, parseDate: parseDate, isoDate: isoDate,
		nPayments: nPayments, schedule: schedule, yearRows: yearRows, durationText: durationText, aprOf: aprOf, LOAN_PRESETS: LOAN_PRESETS };
	if (typeof module !== "undefined" && module.exports) module.exports = MG;
	else root.MG = MG;
})(this);

/* MES Compound Interest Calculator + MES Loan Calculator: one script, two pages (data-mode="grow" | "loan" on #mg). Maths in lib.js (MG). */
(function () {
	"use strict";
	var root = document.getElementById("mg");
	if (!root || typeof MG === "undefined") return;
	var MODE = root.getAttribute("data-mode") === "loan" ? "loan" : "grow";
	var KEY = "mes-compound-interest-calculator:v1";
	var PATH = MODE === "loan" ? "/loan-calculator" : "/compound-interest-calculator";

	/* ------------------------------------------------------------ small helpers */
	function $(id) { return document.getElementById(id); }
	function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
	function loadStore() { try { var s = JSON.parse(localStorage.getItem(KEY) || "{}"); return s && typeof s === "object" ? s : {}; } catch (e) { return {}; } }
	var store = loadStore();
	function saveStore() { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {} }
	function toast(msg) {
		var t = $("mg-toast");
		if (!t) { t = document.createElement("div"); t.id = "mg-toast"; t.className = "tu-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show");
		clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1600);
	}
	function copyText(text, msg) {
		function fallback() {
			var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
			try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); }
			document.body.removeChild(ta);
		}
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fallback); else fallback();
	}
	function download(name, text) {
		try {
			var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" })); a.download = name;
			document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
		} catch (e) { toast("Download failed"); }
	}

	/* currency + number formatting */
	var CURS = [["USD", "$ US dollar"], ["CAD", "$ Canadian dollar"], ["EUR", "€ Euro"], ["GBP", "£ British pound"], ["AUD", "$ Australian dollar"], ["NZD", "$ New Zealand dollar"],
		["INR", "₹ Indian rupee"], ["JPY", "¥ Japanese yen"], ["CHF", "Swiss franc"], ["SGD", "$ Singapore dollar"], ["ZAR", "R South African rand"], ["", "No symbol"]];
	var cur = typeof store.cur === "string" ? store.cur : "USD", fmtCache = {};
	function nf(dp) {
		var k = cur + dp;
		if (!fmtCache[k]) {
			try { fmtCache[k] = cur ? new Intl.NumberFormat("en-US", { style: "currency", currency: cur, currencyDisplay: "narrowSymbol", minimumFractionDigits: dp, maximumFractionDigits: dp }) :
				new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
			catch (e) { fmtCache[k] = new Intl.NumberFormat("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }); }
		}
		return fmtCache[k];
	}
	function zeroDp() { return cur === "JPY"; }
	function money(x, dp) { if (!isFinite(x)) return "–"; if (dp == null) dp = zeroDp() ? 0 : 2; return nf(dp).format(Math.round(x * Math.pow(10, dp)) / Math.pow(10, dp) || 0); }
	function moneyC(c) { return money(c / 100); }
	function plain(x, dp) { return new Intl.NumberFormat("en-US", { minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0 }).format(x); }
	function csvNum(x) { return (Math.round(x * 100) / 100).toFixed(2); }
	function pct(x, dp) { return (x * 100).toFixed(dp == null ? 3 : dp).replace(/\.?0+$/, function (m) { return m.indexOf(".") >= 0 ? "" : m; }) + "%"; }
	function compact(x) {
		var a = Math.abs(x), s = cur === "" ? "" : (nf(0).formatToParts(0).filter(function (p) { return p.type === "currency"; })[0] || { value: "" }).value;
		if (a >= 1e9) return s + (x / 1e9).toFixed(a >= 1e10 ? 0 : 1) + "B";
		if (a >= 1e6) return s + (x / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "M";
		if (a >= 1e3) return s + (x / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k";
		return s + Math.round(x);
	}
	function fillCurSelect() {
		var sel = $("mg-cursel"); if (!sel) return;
		sel.innerHTML = CURS.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === cur ? " selected" : "") + ">" + esc(c[1]) + "</option>"; }).join("");
		on(sel, "change", function () { cur = sel.value; store.cur = cur; saveStore(); curTags(); render(); });
	}
	function curTags() {
		var sym = cur === "" ? "" : (nf(0).formatToParts(0).filter(function (p) { return p.type === "currency"; })[0] || { value: "" }).value;
		Array.prototype.forEach.call(root.querySelectorAll(".mg-cur"), function (el) { el.textContent = sym; el.hidden = !sym; });
	}
	var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
	function dateText(d) { return d ? MON[d.m - 1] + " " + d.d + ", " + d.y : ""; }
	function todayIso() { var t = new Date(); return t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2); }
	function ym(t) { var mo = Math.round(t * 12), y = Math.floor(mo / 12), m = mo % 12, a = []; if (y) a.push(y + (y === 1 ? " year" : " years")); if (m) a.push(m + (m === 1 ? " month" : " months")); return a.join(" ") || "0 months"; }
	function stat(label, value, o) {
		o = o || {};
		return '<div class="tu-stat' + (o.hero ? " tu-stat--hero" : "") + ' mg-tile" tabindex="0" role="button" data-copy="' + esc(o.copy || value) + '" title="Click to copy"><div class="tu-stat__label">' + esc(label) +
			'</div><div class="tu-stat__value' + (o.cls ? " " + o.cls : "") + '">' + esc(value) + "</div>" + (o.sub ? '<div class="tu-stat__sub">' + o.sub + "</div>" : "") + "</div>";
	}
	on(root, "click", function (e) { var t = e.target.closest && e.target.closest(".mg-tile"); if (t) copyText(t.getAttribute("data-copy"), "Copied " + t.getAttribute("data-copy")); });
	on(root, "keydown", function (e) { var t = e.target.closest && e.target.closest(".mg-tile"); if (t && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); t.click(); } });
	function val(id) { var el = $(id); return el ? el.value : ""; }
	function setVal(id, v) { var el = $(id); if (el && v != null) el.value = v; }
	function showErr(msg) { var e = $("mg-err"); if (!e) return; e.textContent = msg || ""; e.hidden = !msg; }

	/* tabs */
	var tab = null, onTab = function () {};
	function setTab(t, focus) {
		var btns = root.querySelectorAll(".mg-tabs [role=tab]"), found = false;
		Array.prototype.forEach.call(btns, function (b) { if (b.getAttribute("data-tab") === t) found = true; });
		if (!found) t = btns[0].getAttribute("data-tab");
		tab = t;
		Array.prototype.forEach.call(btns, function (b) {
			var sel = b.getAttribute("data-tab") === t;
			b.setAttribute("aria-selected", sel ? "true" : "false"); b.tabIndex = sel ? 0 : -1;
			var p = $(b.getAttribute("aria-controls")); if (p) p.hidden = !sel;
			if (sel && focus) b.focus();
		});
		onTab(t);
	}
	(function () {
		var list = root.querySelector(".mg-tabs");
		on(list, "click", function (e) { var b = e.target.closest("[role=tab]"); if (b) { setTab(b.getAttribute("data-tab")); render(); } });
		on(list, "keydown", function (e) {
			var btns = Array.prototype.slice.call(list.querySelectorAll("[role=tab]")), i = btns.indexOf(document.activeElement);
			if (i < 0) return;
			var j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? btns.length - 1 : -1;
			if (j < 0 && e.key !== "ArrowLeft") return;
			e.preventDefault(); j = (j + btns.length) % btns.length;
			setTab(btns[j].getAttribute("data-tab"), true); render();
		});
	})();
	function seg(id, cb) {
		var g = $(id); if (!g) return { get: function () { return ""; }, set: function () {} };
		function set(v) { Array.prototype.forEach.call(g.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === String(v) ? "true" : "false"); }); }
		function get() { var b = g.querySelector('button[aria-pressed="true"]'); return b ? b.getAttribute("data-v") : ""; }
		on(g, "click", function (e) { var b = e.target.closest("button"); if (!b) return; set(b.getAttribute("data-v")); cb(b.getAttribute("data-v")); });
		return { get: get, set: set };
	}

	/* ------------------------------------------------------------ SVG chart (stacked areas / stacked bars / lines, hover + keyboard readout) */
	var NS = "http://www.w3.org/2000/svg";
	function el(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
	// cfg: {x: [t...], stacks: [{v: [], cls}], lines: [{v: [], cls}], bars: bool, xLabel: fn(t), read: fn(i) -> html, readEl}
	function chart(svg, cfg) {
		if (!svg) return;
		var W = Math.max(280, Math.round((svg.parentNode.clientWidth || 640))), H = W < 520 ? 230 : 280;
		var padL = W < 520 ? 46 : 60, padR = 12, padT = 12, padB = 26, iw = W - padL - padR, ih = H - padT - padB;
		svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", W); svg.setAttribute("height", H);
		while (svg.firstChild) svg.removeChild(svg.firstChild);
		var n = cfg.x.length; if (!n) return;
		var tops = [], i, j, ymax = 0;
		for (i = 0; i < n; i++) { var s = 0; for (j = 0; j < (cfg.stacks || []).length; j++) s += Math.max(0, cfg.stacks[j].v[i] || 0); tops.push(s); ymax = Math.max(ymax, s); }
		(cfg.lines || []).forEach(function (l) { l.v.forEach(function (v) { if (v != null && isFinite(v)) ymax = Math.max(ymax, v); }); });
		if (!(ymax > 0)) ymax = 1;
		// nice ticks
		var raw = ymax / 4, mag = Math.pow(10, Math.floor(Math.log10(raw))), step = [1, 2, 2.5, 5, 10].map(function (m) { return m * mag; }).filter(function (m) { return m >= raw; })[0] || raw;
		ymax = Math.ceil(ymax / step) * step;
		var x0 = cfg.x[0], x1 = cfg.x[n - 1]; if (cfg.bars) { x0 -= 0.5; x1 += 0.5; } if (x1 === x0) x1 = x0 + 1;
		function X(t) { return padL + (t - x0) / (x1 - x0) * iw; }
		function Y(v) { return padT + ih - v / ymax * ih; }
		var gGrid = el("g", {}, svg);
		for (var yv = 0; yv <= ymax + 1e-9; yv += step) {
			el("line", { x1: padL, x2: W - padR, y1: Y(yv), y2: Y(yv), "class": "mg-grid" }, gGrid);
			var tx = el("text", { x: padL - 6, y: Y(yv) + 4, "text-anchor": "end", "class": "mg-tx" }, gGrid); tx.textContent = compact(yv);
		}
		// x ticks: about 6-8 labels
		var span = cfg.x[n - 1] - cfg.x[0], xs = [1, 2, 5, 10, 20, 25, 50].filter(function (m) { return span / m <= (W < 520 ? 5 : 9); })[0] || 50;
		for (var xt = Math.ceil(cfg.x[0] / xs) * xs; xt <= cfg.x[n - 1] + 1e-9; xt += xs) {
			var t2 = el("text", { x: X(xt), y: H - 7, "text-anchor": "middle", "class": "mg-tx" }, gGrid); t2.textContent = cfg.xLabel ? cfg.xLabel(xt) : xt;
		}
		if (cfg.bars) {
			var bw = Math.max(2, iw / n * 0.72);
			for (i = 0; i < n; i++) {
				var base = 0;
				for (j = 0; j < cfg.stacks.length; j++) {
					var v = Math.max(0, cfg.stacks[j].v[i] || 0);
					el("rect", { x: X(cfg.x[i]) - bw / 2, y: Y(base + v), width: bw, height: Math.max(0, Y(base) - Y(base + v)), "class": cfg.stacks[j].cls }, svg);
					base += v;
				}
			}
		} else {
			var below = cfg.x.map(function () { return 0; });
			(cfg.stacks || []).forEach(function (st) {
				var top = below.map(function (b, k) { return b + Math.max(0, st.v[k] || 0); }), d = "";
				for (i = 0; i < n; i++) d += (i ? "L" : "M") + X(cfg.x[i]).toFixed(1) + "," + Y(top[i]).toFixed(1);
				for (i = n - 1; i >= 0; i--) d += "L" + X(cfg.x[i]).toFixed(1) + "," + Y(below[i]).toFixed(1);
				el("path", { d: d + "Z", "class": st.cls }, svg);
				below = top;
			});
		}
		(cfg.lines || []).forEach(function (l) {
			var d = "", started = false;
			for (i = 0; i < n; i++) { if (l.v[i] == null || !isFinite(l.v[i])) { started = false; continue; } d += (started ? "L" : "M") + X(cfg.x[i]).toFixed(1) + "," + Y(l.v[i]).toFixed(1); started = true; }
			el("path", { d: d, "class": l.cls }, svg);
		});
		el("line", { x1: padL, x2: W - padR, y1: Y(0), y2: Y(0), "class": "mg-axis" }, svg);
		var hov = el("line", { x1: 0, x2: 0, y1: padT, y2: padT + ih, "class": "mg-hov", visibility: "hidden" }, svg);
		var hit = el("rect", { x: padL, y: padT, width: iw, height: ih, fill: "transparent" }, svg);
		svg.setAttribute("tabindex", "0");
		var cur = -1;
		function show(k) {
			if (k < 0 || k >= n) return;
			cur = k; var px = X(cfg.x[k]);
			hov.setAttribute("x1", px); hov.setAttribute("x2", px); hov.setAttribute("visibility", "visible");
			if (cfg.readEl && cfg.read) cfg.readEl.innerHTML = cfg.read(k);
		}
		function nearest(ev) {
			var r = svg.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W, t = x0 + (px - padL) / iw * (x1 - x0), best = 0, bd = Infinity;
			for (var k = 0; k < n; k++) { var dd = Math.abs(cfg.x[k] - t); if (dd < bd) { bd = dd; best = k; } }
			return best;
		}
		hit.addEventListener("pointermove", function (ev) { show(nearest(ev)); });
		hit.addEventListener("pointerdown", function (ev) { show(nearest(ev)); });
		svg.onkeydown = function (e) {
			if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); show(Math.max(0, Math.min(n - 1, (cur < 0 ? n - 1 : cur) + (e.key === "ArrowRight" ? 1 : -1)))); }
		};
		svg._mgShow = show;
		if (cfg.readEl && cfg.read) cfg.readEl.innerHTML = cfg.read(n - 1);
	}
	function watchResize() {
		if (typeof ResizeObserver === "undefined") { window.addEventListener("resize", function () { render(); }); return; }
		var last = 0, ro = new ResizeObserver(function () { var w = root.clientWidth; if (Math.abs(w - last) > 8) { last = w; clearTimeout(watchResize._t); watchResize._t = setTimeout(render, 80); } });
		ro.observe(root);
	}

	/* table with expandable year rows */
	function expTable(tbl, head, years, subFn, foot) {
		if (!tbl) return;
		var h = "<thead><tr>" + head.map(function (c) { return "<th scope=\"col\">" + c + "</th>"; }).join("") + "</tr></thead><tbody>";
		years.forEach(function (y, idx) {
			h += '<tr class="mg-year" tabindex="0" aria-expanded="false" data-i="' + idx + '">' + y.cells.map(function (c, k) { return k ? "<td>" + c + "</td>" : '<th scope="row"><span class="mg-tw" aria-hidden="true">▸</span> ' + c + "</th>"; }).join("") + "</tr>";
		});
		h += "</tbody>" + (foot ? "<tfoot><tr>" + foot.map(function (c) { return "<td>" + c + "</td>"; }).join("") + "</tr></tfoot>" : "");
		tbl.innerHTML = h;
		function toggle(tr) {
			var open = tr.getAttribute("aria-expanded") === "true";
			if (open) { var nx = tr.nextSibling; while (nx && nx.classList && nx.classList.contains("mg-sub")) { var t = nx.nextSibling; nx.remove(); nx = t; } }
			else {
				var rows = subFn(+tr.getAttribute("data-i")), frag = document.createDocumentFragment();
				rows.forEach(function (cells) { var r = document.createElement("tr"); r.className = "mg-sub"; r.innerHTML = cells.map(function (c) { return "<td>" + c + "</td>"; }).join(""); frag.appendChild(r); });
				tr.parentNode.insertBefore(frag, tr.nextSibling);
			}
			tr.setAttribute("aria-expanded", open ? "false" : "true");
			tr.querySelector(".mg-tw").textContent = open ? "▸" : "▾";
		}
		tbl.onclick = function (e) { var tr = e.target.closest("tr.mg-year"); if (tr) toggle(tr); };
		tbl.onkeydown = function (e) { var tr = e.target.closest && e.target.closest("tr.mg-year"); if (tr && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); toggle(tr); } };
	}
	function bar(elId, legId, parts) {
		var b = $(elId), l = $(legId); if (!b) return;
		var tot = parts.reduce(function (s, p) { return s + Math.max(0, p[1]); }, 0) || 1;
		b.innerHTML = parts.map(function (p) { return '<span class="' + p[2] + '" style="width:' + (Math.max(0, p[1]) / tot * 100).toFixed(2) + '%"></span>'; }).join("");
		if (l) l.innerHTML = parts.map(function (p) { return '<span><i class="mg-k ' + p[2].replace("mg-s", "mg-k") + '"></i>' + esc(p[0]) + ": <b>" + esc(money(p[1])) + "</b> (" + Math.round(Math.max(0, p[1]) / tot * 100) + "%)</span>"; }).join("");
	}
	function num(id, def) { var v = MG.toNum(val(id)); return v == null ? def : v; }

	/* share links: plain query strings */
	function readQuery(map) {
		var q; try { q = new URLSearchParams(location.search); } catch (e) { return false; }
		var any = false;
		Object.keys(map).forEach(function (k) { if (q.has(k)) { any = true; map[k](q.get(k)); } });
		return any;
	}
	function buildLink(pairs) {
		var q = pairs.filter(function (p) { return p[1] != null && p[1] !== ""; }).map(function (p) { return encodeURIComponent(p[0]) + "=" + encodeURIComponent(p[1]); }).join("&");
		return location.origin + PATH + (q ? "?" + q : "");
	}
	function notice(msg) { var n = $("mg-notice"); if (n) { n.textContent = msg; n.hidden = !msg; } }

	/* equation boxes: shrink each typeset formula to fit its box (down to MIN), past that it scrolls inside the box. MathJax (mes-math.js)
	   marks each element .mes-tex--done when it is typeset; re-fit then and whenever the page width changes. */
	function fitEqs(sel, MIN) {
		var els = Array.prototype.slice.call(root.querySelectorAll(sel)); if (!els.length) return;
		function fit() {
			els.forEach(function (e) {
				var c = e.querySelector("mjx-container"); if (!c) return;
				e.style.fontSize = "";
				var avail = e.clientWidth - 2, w = c.getBoundingClientRect().width;
				if (avail > 0 && w > avail) e.style.fontSize = (Math.max(MIN, avail / w) * 100).toFixed(1) + "%";
			});
		}
		if (typeof MutationObserver !== "undefined") els.forEach(function (e) { new MutationObserver(fit).observe(e, { attributes: true, attributeFilter: ["class"], childList: true }); });
		if (typeof ResizeObserver !== "undefined") { var lw = 0; new ResizeObserver(function () { var w = root.clientWidth; if (Math.abs(w - lw) > 4) { lw = w; fit(); } }).observe(root); }
		else window.addEventListener("resize", fit);
		var mc = document.getElementById("main-content");   // A- / A+ change the text size without changing the width
		if (mc && typeof MutationObserver !== "undefined") new MutationObserver(function () { setTimeout(fit, 30); }).observe(mc, { attributes: true, attributeFilter: ["style", "class"] });
		fit();
	}
	fitEqs(".mg-eq__f", 0.78);

	var render = function () {};
	var tm = 0;
	function soon() { clearTimeout(tm); tm = setTimeout(function () { render(); }, 140); }

	/* ================================================================ COMPOUND INTEREST */
	if (MODE === "grow") (function () {
		var S = store.grow || {};
		var FIELDS = { start: "mg-start", dep: "mg-dep", df: "mg-df", timing: "mg-timing", rate: "mg-rate", comp: "mg-comp", years: "mg-years", months: "mg-months",
			inc: "mg-inc", inf: "mg-inf", tax: "mg-tax", target: "mg-target", bstart: "mg-b-start", bdep: "mg-b-dep", bdf: "mg-b-df", brate: "mg-b-rate", bcomp: "mg-b-comp", byears: "mg-b-years",
			r72rate: "mg-r72-rate", r72comp: "mg-r72-comp", r72years: "mg-r72-years" };
		var gk = seg("mg-gk", function () { save(); render(); });
		Object.keys(FIELDS).forEach(function (k) { if (S[k] != null) setVal(FIELDS[k], S[k]); });
		if (S.gk) gk.set(S.gk);
		// share link
		var Q = { s: "start", d: "dep", f: "df", w: "timing", r: "rate", c: "comp", y: "years", m: "months", i: "inc", inf: "inf", tx: "tax", gt: "target",
			bs: "bstart", bd: "bdep", bf: "bdf", br: "brate", bc: "bcomp", by: "byears", qr: "r72rate", qc: "r72comp", qy: "r72years" };
		var qmap = {};
		Object.keys(Q).forEach(function (k) { qmap[k] = function (v) { setVal(FIELDS[Q[k]], v); }; });
		qmap.gk = function (v) { gk.set(v); }; qmap.tab = function (v) { S.tab = v; }; qmap.cu = function (v) { if (CURS.some(function (c) { return c[0] === v; })) { cur = v; store.cur = v; } };
		if (readQuery(qmap)) { notice("Shared calculation loaded. Your own numbers were replaced; change anything to make it yours."); try { history.replaceState(null, "", PATH); } catch (e) {} }
		if (+val("mg-inc") || +val("mg-inf") || +val("mg-tax")) $("mg-more").open = true;
		function save() {
			var s = {}; Object.keys(FIELDS).forEach(function (k) { s[k] = val(FIELDS[k]); });
			s.gk = gk.get(); s.tab = tab; if (typeof ghostOn !== "undefined" && !ghostOn) s.ghost = false; store.grow = s; saveStore();
		}
		function link() {
			var p = [["s", val("mg-start")], ["d", val("mg-dep")], ["f", val("mg-df")], ["w", val("mg-timing")], ["r", val("mg-rate")], ["c", val("mg-comp")], ["y", val("mg-years")], ["m", val("mg-months")]];
			if (MG.toNum(val("mg-inc"))) p.push(["i", val("mg-inc")]);
			if (MG.toNum(val("mg-inf"))) p.push(["inf", val("mg-inf")]);
			if (MG.toNum(val("mg-tax"))) p.push(["tx", val("mg-tax")]);
			if (tab === "goal") p.push(["gt", val("mg-target")], ["gk", gk.get()]);
			if (tab === "cmp") ["bs", "bd", "bf", "br", "bc", "by"].forEach(function (k) { p.push([k, val(FIELDS[Q[k]])]); });
			if (tab === "r72") p = [["qr", val("mg-r72-rate")], ["qc", val("mg-r72-comp")], ["qy", val("mg-r72-years")]];
			if (tab !== "grow") p.push(["tab", tab]);
			if (cur !== "USD") p.push(["cu", cur || "none"]);
			return buildLink(p);
		}
		// read the form into a grow() object (+ validation)
		function readA() {
			var o = { start: num("mg-start", 0), dep: num("mg-dep", 0), df: val("mg-df"), timing: val("mg-timing"), rate: num("mg-rate", 0) / 100, comp: val("mg-comp"),
				years: num("mg-years", 0), months: num("mg-months", 0), inc: num("mg-inc", 0) / 100, inf: num("mg-inf", 0) / 100, tax: num("mg-tax", 0) / 100 };
			var err = "";
			if (o.start < 0 || o.dep < 0) err = "Amounts can't be negative.";
			else if (o.rate < 0 || o.rate > 1) err = "Type a yearly rate between 0% and 100%.";
			else if (o.years < 0 || o.months < 0 || o.years + o.months / 12 > 100) err = "Choose a time between 1 month and 100 years.";
			else if (o.tax < 0 || o.tax > 1 || o.inf < -0.5 || o.inf > 1 || o.inc < -0.5 || o.inc > 1) err = "Check the percentages under More options.";
			o.years = Math.floor(o.years); o.months = Math.round(o.months);
			return { o: o, err: err };
		}
		function readB(A) {
			function or(id, d) { var v = MG.toNum(val(id)); return v == null ? d : v; }
			return { start: or("mg-b-start", A.start), dep: or("mg-b-dep", A.dep), df: val("mg-b-df") || A.df, timing: A.timing, rate: or("mg-b-rate", A.rate * 100) / 100,
				comp: val("mg-b-comp") || A.comp, years: Math.floor(or("mg-b-years", A.years + A.months / 12)), months: val("mg-b-years") ? 0 : A.months, inc: A.inc, inf: A.inf, tax: A.tax };
		}
		function perText(df) { return MG.DFREQ_PER[df] || "month"; }
		function moreSummary(o) {
			var a = []; if (o.inc) a.push("deposit +" + pct(o.inc, 2) + "/yr"); if (o.inf) a.push("inflation " + pct(o.inf, 2)); if (o.tax) a.push("tax " + pct(o.tax, 2));
			$("mg-more-sum").textContent = a.length ? "(" + a.join(", ") + ")" : "";
		}
		function steps2points(r) {   // chart points from the simulation steps (down-sampled to at most ~360)
			var pts = [{ t: 0, deps: r.start, intr: 0, bal: r.start }], every = Math.max(1, Math.ceil(r.N / 360));
			for (var k = 0; k < r.N; k++) if ((k + 1) % every === 0 || k === r.N - 1) { var s = r.steps[k]; pts.push({ t: s.t, deps: s.deps, intr: s.intr, bal: s.bal, k: k }); }
			return pts;
		}
		var lastR = null;
		onTab = function (t) { $("mg-inputs").hidden = t === "r72"; Array.prototype.forEach.call(root.querySelectorAll("[data-solve]"), function (f) { f.classList.remove("mg-solving"); }); };
		var unitName = function (r) { return r.spy === 12 ? "Month" : "Week"; };

		/* "Try other numbers on the chart": the sliders hold a trial copy of the main inputs; the form is untouched until "Use these numbers" */
		var trial = null, slR = {}, SLK = ["start", "dep", "rate", "years"];
		var ghostOn = S.ghost !== false;
		$("mg-sl-ghost").checked = ghostOn;
		function trialOf(o) {
			if (!trial) return o;
			var t = Object.assign({}, o, { start: trial.start, dep: trial.dep, rate: trial.rate / 100, years: trial.years, comp: trial.comp });
			if (trial.years !== o.years) t.months = 0;
			if (t.df === "none" && t.dep > 0) t.df = "monthly";
			return t;
		}
		function slFmt(k, v) { return k === "rate" ? plain(v, 2).replace(/\.?0+$/, "") + "%" : k === "years" ? v + (v === 1 ? " year" : " years") : money(v, v >= 1000 || zeroDp() ? 0 : 2); }
		function syncSliders(o, keepRanges) {   // set ranges + positions (from the trial if one is active, else from the form)
			var cv = trial || { start: o.start, dep: o.dep, rate: o.rate * 100, years: o.years + (o.months ? Math.round(o.months / 12 * 10) / 10 : 0), comp: o.comp };
			SLK.forEach(function (k) {
				var inp = $("mg-sl-" + k), typed = k === "rate" ? o.rate * 100 : k === "years" ? o.years + o.months / 12 : o[k];
				if (!keepRanges || !slR[k]) { slR[k] = MG.sliderRange(k, typed); inp.min = slR[k].min; inp.max = slR[k].max; inp.step = slR[k].step; }
				if (document.activeElement !== inp || !trial) inp.value = cv[k];
				var out = $("mg-sl-" + k + "-v"); out.textContent = slFmt(k, k === "years" && !trial ? Math.round(typed * 10) / 10 : cv[k]);
				out.classList.toggle("mg-chg", !!trial && Math.abs(cv[k] - typed) > 1e-9);
			});
			$("mg-sl-dep-per").textContent = "each " + perText(o.df === "none" ? "monthly" : o.df);
			Array.prototype.forEach.call($("mg-sl-comp").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === cv.comp ? "true" : "false"); });
			$("mg-try-btns").hidden = !trial;
			$("mg-try").classList.toggle("mg-trying", !!trial);
			$("mg-try-state").textContent = trial ? "Showing the slider numbers. Use them, or go back to the numbers in the form." : "Drag a slider: the chart and the results follow. The form keeps your own numbers.";
		}
		function startTrial(o) { if (!trial) trial = { start: o.start, dep: o.dep, rate: Math.round(o.rate * 1e6) / 1e4, years: o.years, comp: o.comp === "semiannual" ? "semiannual" : o.comp }; }
		SLK.forEach(function (k) {
			on($("mg-sl-" + k), "input", function () {
				var A = readA(); if (A.err) return;
				startTrial(A.o);
				trial[k] = MG.snapSlider(k, this.value, slR[k]);
				render();
			});
		});
		on($("mg-sl-comp"), "click", function (e) {
			var b = e.target.closest("button"); if (!b) return;
			var A = readA(); if (A.err) return;
			startTrial(A.o); trial.comp = b.getAttribute("data-v"); render();
		});
		on($("mg-sl-ghost"), "change", function () { ghostOn = this.checked; save(); render(); });
		on($("mg-try-back"), "click", function () { trial = null; render(); toast("Back to your numbers"); });
		on($("mg-try-use"), "click", function () {
			if (!trial) return;
			var o = readA().o, t = trialOf(o);
			setVal("mg-start", plain(t.start, t.start % 1 ? 2 : 0)); setVal("mg-dep", plain(t.dep, t.dep % 1 ? 2 : 0));
			setVal("mg-rate", String(Math.round(t.rate * 1e6) / 1e4)); setVal("mg-years", t.years); setVal("mg-months", t.months);
			setVal("mg-comp", t.comp); if (o.df !== t.df) setVal("mg-df", t.df);
			trial = null; render(); toast("Copied into the form");
		});

		function renderGrow(A) {
			var base = A.o, o = trialOf(base), r = MG.grow(o); lastR = r;
			var rg = trial && ghostOn ? MG.grow(base) : null;
			syncSliders(base, !!trial);
			var hero = stat("Final balance", money(r.final), { hero: true, sub: "after " + ym(r.T) }) +
				stat("Total put in", money(r.deposits), { sub: money(r.start) + " start + " + money(r.deposits - r.start) + " deposits" }) +
				stat("Total interest", money(r.interest), { cls: "tu-pos", sub: r.deposits > 0 ? (r.interest / r.deposits * 100).toFixed(1) + "% of what you put in" : "" }) +
				stat("Yearly growth (APY)", pct(r.apy, 3), { sub: pct(o.rate, 3) + " " + MG.COMP_LABEL[o.comp].toLowerCase() });
			if (o.inf) hero += stat("In today's money", money(r.real), { sub: "at " + pct(o.inf, 2) + " inflation a year" });
			if (o.tax) hero += stat("Tax paid on interest", money(r.tax), { cls: "tu-neg" });
			$("mg-hero").innerHTML = hero;
			var dtext = o.df !== "none" && o.dep > 0 ? " and add " + money(o.dep) + " every " + perText(o.df) + (o.timing === "s" ? " (at the start)" : "") + (o.inc ? ", raised " + pct(o.inc, 2) + " each year" : "") : "";
			$("mg-sentence").textContent = r.N ? "If you start with " + money(o.start) + dtext + " at " + pct(o.rate, 3) + " a year compounded " + MG.COMP_LABEL[o.comp].toLowerCase() +
				", after " + ym(r.T) + " you will have " + money(r.final) + ", of which " + money(r.interest) + " is interest." +
				(trial ? (function () { var f0 = MG.grow(base).final, d = r.final - f0; return Math.abs(d) < 0.005 ? " (Same as your own numbers.)" : " (" + money(Math.abs(d)) + (d > 0 ? " more" : " less") + " than your own numbers.)"; })() : "") : "Choose how long to save.";
			bar("mg-split", "mg-split-legend", [["Starting amount", r.start, "mg-s--start"], ["Deposits", r.deposits - r.start, "mg-s--dep"], ["Interest", r.interest, "mg-s--int"]]);
			var pts = steps2points(r);
			$("mg-leg-real").hidden = !o.inf;
			$("mg-leg-ghost").hidden = !rg;
			function at(rr, t) { if (t > rr.T + 1e-9) return null; if (t <= 0) return rr.start; var k = Math.round(t * rr.spy) - 1; return rr.steps[Math.max(0, Math.min(rr.N - 1, k))].bal; }
			var ghost = rg ? pts.map(function (p) { return at(rg, p.t); }) : null;
			var lines = o.inf ? [{ v: pts.map(function (p) { return p.bal / Math.pow(1 + o.inf, p.t); }), cls: "mg-l-real" }] : [];
			if (ghost) lines.push({ v: ghost, cls: "mg-l-base" });
			chart($("mg-chart"), { x: pts.map(function (p) { return p.t; }), stacks: [{ v: pts.map(function (p) { return p.deps; }), cls: "mg-a-dep" }, { v: pts.map(function (p) { return p.intr; }), cls: "mg-a-int" }],
				lines: lines,
				xLabel: function (t) { return "Yr " + t; }, readEl: $("mg-readout"),
				read: function (i) { var p = pts[i]; return "<b>" + esc(p.t ? ym(p.t) : "Start") + "</b>: balance <b>" + esc(money(p.bal)) + "</b> = put in " + esc(money(p.deps)) + " + interest " + esc(money(p.intr)) + (o.inf ? " · today's money " + esc(money(p.bal / Math.pow(1 + o.inf, p.t))) : "") +
					(ghost ? " · your numbers " + (ghost[i] == null ? "ended at " + esc(money(rg.final)) : "<b>" + esc(money(ghost[i])) + "</b>") : ""); } });
			// table
			$("mg-subname").textContent = r.spy === 12 ? "month" : (o.df === "weekly" ? "week" : "2 weeks");
			var head = ["Year", "Deposits", "Interest"]; if (o.tax) head.push("Tax"); head.push("Balance"); if (o.inf) head.push("Today's money");
			var yrs = r.years.map(function (y) { var c = [String(y.y), money(y.dep), money(y.int)]; if (o.tax) c.push(money(y.tax)); c.push(money(y.bal)); if (o.inf) c.push(money(y.real)); return { cells: c }; });
			var foot = ["Total", money(r.deposits - r.start), money(r.interest)]; if (o.tax) foot.push(money(r.tax)); foot.push(money(r.final)); if (o.inf) foot.push(money(r.real));
			expTable($("mg-table"), head, yrs, function (idx) {
				var y = r.years[idx], out = [];
				for (var k = y.from; k < y.to; k++) {
					var s = r.steps[k], c = [unitName(r) + " " + (k - y.from + 1), money(s.d), money(s.i)]; if (o.tax) c.push(""); c.push(money(s.bal)); if (o.inf) c.push(money(s.bal / Math.pow(1 + o.inf, s.t))); out.push(c);
				}
				return out;
			}, foot);
		}
		function goalFieldMark(which) {
			Array.prototype.forEach.call(root.querySelectorAll("[data-solve]"), function (f) { f.classList.toggle("mg-solving", f.getAttribute("data-solve") === which); });
		}
		var goalUse = null;
		function renderGoal(A) {
			var o = A.o, target = num("mg-target", 0), k = gk.get() || "dep", out = "", sent = "", hint = "";
			goalFieldMark(k === "time" ? "time" : k);
			goalUse = null;
			if (!(target > 0)) { $("mg-goal-out").innerHTML = ""; $("mg-goal-sentence").textContent = "Type the amount you want to reach."; return; }
			if (k === "dep") {
				hint = "Uses the starting amount, rate, compounding and time above; the deposit box is ignored.";
				var g = MG.solveDeposit(o, target);
				if (!g) sent = "Choose a time to save first.";
				else if (g.reached) { out = stat("Deposit needed", money(0), { hero: true }); sent = "Your starting amount alone grows to " + money(MG.grow(o).final) + ", already past your goal."; }
				else {
					var dep = Math.ceil(g.dep * 100) / 100, r = MG.grow(Object.assign({}, o, { dep: dep, df: g.df }));
					out = stat("Deposit every " + perText(g.df), money(dep), { hero: true }) + stat("Total put in", money(r.deposits)) + stat("Interest earned", money(r.interest), { cls: "tu-pos" }) + stat("You reach", money(r.final));
					sent = "Put in " + money(dep) + " every " + perText(g.df) + (o.inc ? " (raised " + pct(o.inc, 2) + " a year)" : "") + " for " + ym(r.T) + " to reach " + money(target) + "." + (o.df === "none" ? " (Monthly deposits were assumed because \"How often\" is set to no deposits.)" : "");
					goalUse = function () { setVal("mg-dep", dep.toFixed(2)); if (o.df === "none") setVal("mg-df", "monthly"); };
				}
			} else if (k === "time") {
				hint = "Uses the starting amount, deposits and rate above; the years box is ignored.";
				var t = MG.solveTime(o, target);
				if (!t) { out = stat("Time needed", "over 200 years", { hero: true }); sent = "With these numbers the balance doesn't reach " + money(target) + " within 200 years. Add a deposit or a higher rate."; }
				else {
					var dd = new Date(); dd.setMonth(dd.getMonth() + Math.round(t.t * 12));
					var rr = t.steps ? MG.grow(Object.assign({}, o, { years: 200, months: 0 })).steps[t.steps - 1] : { deps: o.start, intr: 0 };
					out = stat("Time needed", t.t ? ym(t.t) : "already there", { hero: true }) + stat("Reached around", MON[dd.getMonth()] + " " + dd.getFullYear()) + stat("Total put in", money(rr.deps)) + stat("Interest by then", money(rr.intr), { cls: "tu-pos" });
					sent = t.t ? "You pass " + money(target) + " after " + ym(t.t) + " (" + plain(t.steps) + " " + (t.spy === 12 ? "months" : "deposit periods") + ")." : "Your starting amount is already at your goal.";
					goalUse = function () { setVal("mg-years", t.years); setVal("mg-months", t.months); };
				}
			} else {
				hint = "Uses the starting amount, deposits, compounding and time above; the rate box is ignored.";
				var rate = MG.solveRate(o, target);
				if (rate == null) { out = stat("Rate needed", "over 100%", { hero: true }); sent = "Even 100% a year isn't enough in this time. Save for longer or put in more."; }
				else {
					var r3 = MG.grow(Object.assign({}, o, { rate: rate }));
					out = stat("Rate needed", pct(rate, 3), { hero: true, sub: MG.COMP_LABEL[o.comp].toLowerCase() }) + stat("Yearly growth (APY)", pct(MG.apy(rate, o.comp), 3)) + stat("Total put in", money(r3.deposits)) + stat("Interest", money(r3.interest), { cls: "tu-pos" });
					sent = rate === 0 ? "Your deposits alone reach the goal; no interest is needed." : "You need about " + pct(rate, 3) + " a year (compounded " + MG.COMP_LABEL[o.comp].toLowerCase() + ") to reach " + money(target) + " in " + ym(r3.T) + ".";
					goalUse = function () { setVal("mg-rate", (Math.round(rate * 1e6) / 1e4).toString()); };
				}
			}
			$("mg-goal-hint").textContent = hint;
			$("mg-goal-out").innerHTML = out; $("mg-goal-sentence").textContent = sent;
			$("mg-goal-use").hidden = !goalUse;
		}
		function renderCmp(A) {
			var a = A.o, b = readB(a), ra = MG.grow(a), rb = MG.grow(b);
			function row(label, x, y, f, good) {
				var d = y - x, cls = Math.abs(d) < 0.005 ? "" : ((d > 0) === (good !== false) ? "tu-pos" : "tu-neg");
				return "<tr><th scope=\"row\">" + label + "</th><td>" + f(x) + "</td><td>" + f(y) + "</td><td class=\"" + cls + "\">" + (Math.abs(d) < 0.005 ? "same" : (d > 0 ? "+" : "−") + f(Math.abs(d))) + "</td></tr>";
			}
			var h = "<thead><tr><th scope=\"col\"></th><th scope=\"col\">A</th><th scope=\"col\">B</th><th scope=\"col\">B − A</th></tr></thead><tbody>" +
				row("Final balance", ra.final, rb.final, money) + row("Total put in", ra.deposits, rb.deposits, money, false) + row("Interest earned", ra.interest, rb.interest, money) +
				row("Yearly growth (APY)", ra.apy, rb.apy, function (x) { return pct(x, 3); }) + row("Years", ra.T, rb.T, function (x) { return ym(x); }, false);
			if (a.inf) h += row("In today's money", ra.real, rb.real, money);
			$("mg-cmp-table").innerHTML = h + "</tbody>";
			var w = rb.final - ra.final;
			$("mg-cmp-sentence").textContent = Math.abs(w) < 0.005 ? "Both scenarios end with the same balance." : "Scenario " + (w > 0 ? "B" : "A") + " ends with " + money(Math.abs(w)) + " more" +
				(ra.deposits !== rb.deposits ? " (and puts in " + money(Math.abs(rb.deposits - ra.deposits)) + " " + ((rb.deposits > ra.deposits) === (w > 0) ? "more" : "less") + ")" : "") + ".";
			var T = Math.max(ra.T, rb.T), xs = [], av = [], bv = [];
			function at(r, t) { if (t > r.T + 1e-9) return null; if (t <= 0) return r.start; var k = Math.round(t * r.spy) - 1; return r.steps[Math.max(0, Math.min(r.N - 1, k))].bal; }
			var stepT = T <= 30 ? 1 / 12 : 0.25;
			for (var t = 0; t <= T + 1e-9; t += stepT) { var tt = Math.round(t * 1e6) / 1e6; xs.push(tt); av.push(at(ra, tt)); bv.push(at(rb, tt)); }
			chart($("mg-cmp-chart"), { x: xs, lines: [{ v: av, cls: "mg-l-a" }, { v: bv, cls: "mg-l-b" }], xLabel: function (t) { return "Yr " + t; }, readEl: $("mg-cmp-readout"),
				read: function (i) { return "<b>" + esc(xs[i] ? ym(xs[i]) : "Start") + "</b>: A " + (av[i] == null ? "ended" : "<b>" + esc(money(av[i])) + "</b>") + " · B " + (bv[i] == null ? "ended" : "<b>" + esc(money(bv[i])) + "</b>"); } });
		}
		function renderR72() {
			var comp = val("mg-r72-comp"), p = MG.toNum(val("mg-r72-rate")), yrs = MG.toNum(val("mg-r72-years")), out = "", sent = "";
			if (yrs > 0) {
				var e = Math.pow(2, 1 / yrs) - 1, n = MG.COMP[comp], nom = n === 0 ? Math.log(2) / yrs : n * (Math.pow(1 + e, 1 / n) - 1);
				out = stat("Rule of 72 says", pct(0.72 / yrs, 2), { hero: true, sub: "72 ÷ " + plain(yrs, 2).replace(/\.00$/, "") }) + stat("Exact rate needed", pct(nom, 3), { sub: "compounded " + MG.COMP_LABEL[comp].toLowerCase() });
				sent = "To double your money in " + plain(yrs, 2).replace(/\.00$/, "") + " years you need about " + pct(nom, 3) + " a year.";
			} else if (p > 0 && p <= 100) {
				var ex = MG.doubling(p / 100, comp), est = MG.rule72(p);
				out = stat("Rule of 72 says", plain(est, 2) + " years", { hero: true, sub: "72 ÷ " + p }) + stat("Exact doubling time", plain(ex, 2) + " years", { sub: ym(ex) }) +
					stat("Rule of 72 is off by", (est >= ex ? "+" : "−") + plain(Math.abs(est - ex) * 12, 1) + " months") + stat("10x your money in", plain(Math.log(10) / Math.log1p(MG.apy(p / 100, comp)), 1) + " years");
				sent = "At " + p + "% a year compounded " + MG.COMP_LABEL[comp].toLowerCase() + " money doubles in " + ym(ex) + "; the rule of 72 estimate is " + plain(est, 1) + " years.";
			} else sent = "Type a rate (or a number of years).";
			$("mg-r72-out").innerHTML = out; $("mg-r72-sentence").textContent = sent;
			var rates = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 25], h = "<thead><tr><th scope=\"col\">Rate</th><th scope=\"col\">Rule of 72</th><th scope=\"col\">Rule of 70</th><th scope=\"col\">Exact</th><th scope=\"col\">Rule of 72 error</th></tr></thead><tbody>";
			rates.forEach(function (r) {
				var e72 = 72 / r, ex = MG.doubling(r / 100, comp), err = (e72 - ex) * 12;
				h += "<tr" + (r === p ? ' class="mg-hl"' : "") + "><th scope=\"row\">" + r + "%</th><td>" + e72.toFixed(2) + "</td><td>" + (70 / r).toFixed(2) + "</td><td><b>" + ex.toFixed(2) + "</b></td><td>" + (err >= 0 ? "+" : "−") + Math.abs(err).toFixed(1) + " months</td></tr>";
			});
			$("mg-r72-table").innerHTML = h + "</tbody>";
		}
		render = function () {
			if (!tab) return;
			var A = readA();
			moreSummary(A.o);
			showErr(A.err);
			save();
			if (tab === "r72") { renderR72(); return; }
			if (A.err) return;
			if (tab === "grow") renderGrow(A);
			else if (tab === "goal") renderGoal(A);
			else if (tab === "cmp") renderCmp(A);
		};
		function csv() {
			var r = lastR || MG.grow(readA().o), o = readA().o, lines = [["Period", "Years", "Deposit", "Interest", "Tax", "Balance", "Total put in", "Total interest"].join(",")];
			r.steps.forEach(function (s) { lines.push([s.k, s.t.toFixed(4), csvNum(s.d), csvNum(s.i), "", csvNum(s.bal), csvNum(s.deps), csvNum(s.intr)].join(",")); });
			void o; return lines.join("\n");
		}
		on($("mg-copy-csv"), "click", function () { copyText(csv().replace(/,/g, "\t"), "Table copied: paste it into a spreadsheet"); });
		on($("mg-dl-csv"), "click", function () { download("compound-interest.csv", csv()); });
		on($("mg-copy-sum"), "click", function () { copyText($("mg-sentence").textContent + " " + link(), "Summary copied"); });
		on($("mg-copy-link"), "click", function () { copyText(link(), "Link copied"); });
		on($("mg-goal-use"), "click", function () { if (goalUse) { goalUse(); setTab("grow"); render(); toast("Copied into the calculator"); } });
		on($("mg-b-copy"), "click", function () { var a = readA().o; setVal("mg-b-start", val("mg-start")); setVal("mg-b-dep", val("mg-dep")); setVal("mg-b-df", a.df); setVal("mg-b-rate", val("mg-rate")); setVal("mg-b-comp", a.comp); setVal("mg-b-years", a.years); render(); });
		Array.prototype.forEach.call(root.querySelectorAll("[data-b]"), function (b) {
			on(b, "click", function () {
				var a = readA().o, k = b.getAttribute("data-b");
				setVal("mg-b-start", val("mg-start")); setVal("mg-b-dep", val("mg-dep")); setVal("mg-b-df", a.df); setVal("mg-b-rate", val("mg-rate")); setVal("mg-b-comp", a.comp); setVal("mg-b-years", a.years);
				if (k === "rate+1") setVal("mg-b-rate", String(Math.round((a.rate * 100 + 1) * 1e6) / 1e6));
				if (k === "dep2") setVal("mg-b-dep", String(a.dep * 2));
				if (k === "years5") setVal("mg-b-years", a.years + 5);
				if (k === "late") setVal("mg-b-years", Math.max(1, a.years - 10));
				render();
			});
		});
		Array.prototype.forEach.call(root.querySelectorAll("input, select"), function (e) {
			if (e.closest("#mg-try")) return;
			on(e, e.tagName === "SELECT" ? "change" : "input", function () { if (/^mg-(start|dep|df|rate|comp|years|months|inc|inf|tax|timing)$/.test(e.id)) trial = null; soon(); });
		});
		// scenario B defaults
		if (!val("mg-b-rate")) { var a0 = readA().o; setVal("mg-b-start", val("mg-start")); setVal("mg-b-dep", val("mg-dep")); setVal("mg-b-df", a0.df); setVal("mg-b-rate", String(Math.round((a0.rate * 100 + 1) * 1e6) / 1e6)); setVal("mg-b-comp", a0.comp); setVal("mg-b-years", a0.years); }
		fillCurSelect(); curTags();
		setTab(S.tab || "grow");
		render(); watchResize();
	})();

	/* ================================================================ LOAN */
	if (MODE === "loan") (function () {
		var S = store.loan || {};
		var FIELDS = { amount: "mg-amount", afford: "mg-afford", rate: "mg-rate", years: "mg-years", months: "mg-months", freq: "mg-freq", sd: "mg-sd", x: "mg-x", l: "mg-l", lk: "mg-lk", fee: "mg-fee" };
		var ff = seg("mg-ff", function () { save(); render(); });
		Object.keys(FIELDS).forEach(function (k) { if (S[k] != null) setVal(FIELDS[k], S[k]); });
		if (S.ff != null) ff.set(S.ff);
		if (!MG.parseDate(val("mg-sd"))) setVal("mg-sd", todayIso());
		var Q = { a: "amount", p: "afford", r: "rate", y: "years", m: "months", f: "freq", sd: "sd", x: "x", l: "l", lk: "lk", fee: "fee" }, qmap = {};
		Object.keys(Q).forEach(function (k) { qmap[k] = function (v) { setVal(FIELDS[Q[k]], v); }; });
		qmap.ff = function (v) { ff.set(v === "1" ? "1" : "0"); }; qmap.tab = function (v) { S.tab = v; }; qmap.cu = function (v) { if (v === "none") v = ""; if (CURS.some(function (c) { return c[0] === v; })) { cur = v; store.cur = v; } };
		if (readQuery(qmap)) { notice("Shared calculation loaded. Change anything to make it yours."); try { history.replaceState(null, "", PATH); } catch (e) {} }
		function save() { var s = {}; Object.keys(FIELDS).forEach(function (k) { s[k] = val(FIELDS[k]); }); s.ff = ff.get(); s.tab = tab; store.loan = s; saveStore(); }
		function link() {
			var p = [[tab === "borrow" ? "p" : "a", val(tab === "borrow" ? "mg-afford" : "mg-amount")], ["r", val("mg-rate")], ["y", val("mg-years")], ["m", val("mg-months")], ["f", val("mg-freq")], ["sd", val("mg-sd")]];
			if (tab === "extra") p.push(["x", val("mg-x")], ["l", val("mg-l")], ["lk", val("mg-lk")]);
			if (tab === "apr") p.push(["fee", val("mg-fee")], ["ff", ff.get()]);
			if (tab !== "pay") p.push(["tab", tab]);
			if (cur !== "USD") p.push(["cu", cur || "none"]);
			return buildLink(p);
		}
		onTab = function (t) {
			$("mg-amount-wrap").hidden = t === "borrow"; $("mg-afford-wrap").hidden = t !== "borrow";
			Array.prototype.forEach.call(root.querySelectorAll("#mg-presets .tu-chip"), function (c) { c.setAttribute("aria-pressed", "false"); });
		};
		Array.prototype.forEach.call(root.querySelectorAll("#mg-presets .tu-chip"), function (c) {
			on(c, "click", function () {
				var p = MG.LOAN_PRESETS[c.getAttribute("data-p")]; if (!p) return;
				setVal("mg-amount", plain(+p.amount)); setVal("mg-rate", p.rate); setVal("mg-years", p.years); setVal("mg-months", p.months); setVal("mg-freq", p.freq); setVal("mg-fee", p.fee);
				if (tab === "borrow") setTab("pay");
				render();
				Array.prototype.forEach.call(root.querySelectorAll("#mg-presets .tu-chip"), function (x) { x.setAttribute("aria-pressed", x === c ? "true" : "false"); });
			});
		});
		function read() {
			var rate = MG.parseRate(val("mg-rate")), freq = val("mg-freq"), F = MG.FREQ[freq] || MG.FREQ.monthly, years = num("mg-years", 0), months = num("mg-months", 0);
			var n = MG.nPayments(Math.floor(years), Math.round(months), F.ppy), start = MG.parseDate(val("mg-sd")), err = "";
			var amount = MG.toCents(val("mg-amount")), afford = MG.toCents(val("mg-afford"));
			if (!rate || rate.f > 100) err = "Type a yearly interest rate between 0% and 100%.";
			else if (!(n >= 1) || years + months / 12 > 50) err = "Choose a term between one payment period and 50 years.";
			else if (tab === "borrow" ? !(afford > 0) : !(amount > 0)) err = tab === "borrow" ? "Type the payment you can afford." : "Type the loan amount.";
			return { rate: rate, freq: freq, F: F, n: n, start: start, amount: amount, afford: afford, err: err };
		}
		var cur0 = null;     // the scenario shown in the charts + schedule
		function heroPay(s, I, label) {
			var last = s.rows.length ? s.rows[s.rows.length - 1].pay : 0;
			return stat(label || ("Payment every " + I.F.per), moneyC(s.pay), { hero: true, sub: last !== s.pay ? "last payment " + moneyC(last) : I.n + " payments" }) +
				stat("Total interest", moneyC(s.interest), { cls: "tu-neg", sub: (s.interest / s.loan * 100).toFixed(1) + "% of the loan" }) +
				stat("Total paid", moneyC(s.paid)) + stat("Paid off", s.payoff ? dateText(s.payoff) : MG.durationText(s.periods, s.ppy), { sub: MG.durationText(s.periods, s.ppy) });
		}
		function sentence(s, I) {
			return "Borrowing " + moneyC(s.loan) + " at " + I.rate.f + "% for " + MG.durationText(I.n, I.F.ppy) + " costs " + moneyC(s.pay) + " every " + I.F.per + " (" + I.n + " payments). " +
				"You pay " + moneyC(s.interest) + " in interest, " + moneyC(s.paid) + " in total" + (s.payoff ? ", and the last payment is on " + dateText(s.payoff) : "") + ".";
		}
		render = function () {
			if (!tab) return;
			save();
			var I = read(); showErr(I.err);
			$("mg-charts").hidden = !!I.err;
			if (I.err) { return; }
			var base = null, s = null, compare = null;
			if (tab === "pay") {
				s = MG.schedule({ loan: I.amount, rate: I.rate, freq: I.freq, n: I.n, start: I.start });
				$("mg-hero").innerHTML = heroPay(s, I); $("mg-sentence").textContent = sentence(s, I);
				bar("mg-split", "mg-split-legend", [["Principal", s.loan / 100, "mg-s--dep"], ["Interest", s.interest / 100, "mg-s--int"]]);
			} else if (tab === "borrow") {
				var per = MG.periodic(I.rate, I.F.ppy), L = MG.pv(I.afford, per.f, I.n);
				s = MG.schedule({ loan: L, rate: I.rate, freq: I.freq, n: I.n, start: I.start });
				$("mg-borrow-out").innerHTML = stat("You can borrow", moneyC(L), { hero: true, sub: "for " + MG.durationText(I.n, I.F.ppy) }) + stat("Payment", moneyC(s.pay), { sub: "every " + I.F.per }) +
					stat("Total interest", moneyC(s.interest), { cls: "tu-neg" }) + stat("Total paid", moneyC(s.paid));
				$("mg-borrow-sentence").textContent = "A payment of " + moneyC(I.afford) + " every " + I.F.per + " at " + I.rate.f + "% repays a loan of about " + moneyC(L) + " over " + MG.durationText(I.n, I.F.ppy) + ".";
				var h = "<thead><tr><th scope=\"col\">Term</th><th scope=\"col\">You can borrow</th><th scope=\"col\">Total interest</th></tr></thead><tbody>";
				[1, 2, 3, 4, 5, 6, 7, 10, 15].forEach(function (y) {
					var nn = MG.nPayments(y, 0, I.F.ppy), LL = MG.pv(I.afford, per.f, nn), ss = MG.schedule({ loan: LL, rate: I.rate, freq: I.freq, n: nn });
					h += "<tr" + (nn === I.n ? ' class="mg-hl"' : "") + "><th scope=\"row\">" + y + (y === 1 ? " year" : " years") + "</th><td>" + moneyC(LL) + "</td><td>" + moneyC(ss.interest) + "</td></tr>";
				});
				$("mg-borrow-table").innerHTML = h + "</tbody>";
				$("mg-borrow-use").onclick = function () { setVal("mg-amount", (L / 100).toFixed(2)); setTab("pay"); render(); toast("Loan amount set to " + moneyC(L)); };
			} else if (tab === "extra") {
				var x = MG.toCents(val("mg-x")) || 0, l = MG.toCents(val("mg-l")) || 0, lk = Math.max(1, Math.round(num("mg-lk", 1)));
				base = MG.schedule({ loan: I.amount, rate: I.rate, freq: I.freq, n: I.n, start: I.start });
				s = MG.schedule({ loan: I.amount, rate: I.rate, freq: I.freq, n: I.n, start: I.start, extra: x, lump: { amount: l, at: lk } });
				$("mg-lk-date").textContent = I.start && lk <= I.n ? dateText(MG.dateAt(I.start, lk, I.freq)) : (lk > I.n ? "after the loan ends" : "");
				var saved = base.periods - s.periods, isaved = base.interest - s.interest;
				$("mg-extra-out").innerHTML = stat("Interest saved", moneyC(isaved), { hero: true, cls: "tu-pos" }) + stat("Paid off sooner by", MG.durationText(saved, s.ppy), { sub: saved + " fewer payments" }) +
					stat("New payoff", s.payoff ? dateText(s.payoff) : MG.durationText(s.periods, s.ppy), { sub: "was " + (base.payoff ? dateText(base.payoff) : MG.durationText(base.periods, base.ppy)) }) +
					stat("Total interest now", moneyC(s.interest), { sub: "was " + moneyC(base.interest) });
				$("mg-extra-sentence").textContent = (x || l) ? "Paying " + (x ? moneyC(x) + " extra every " + I.F.per : "") + (x && l ? " and " : "") + (l ? "a one-time " + moneyC(l) + " with payment " + lk : "") +
					" pays the loan off " + MG.durationText(saved, s.ppy) + " sooner and saves " + moneyC(isaved) + " in interest." : "Type an extra amount to see how much sooner the loan is paid off.";
				compare = base;
			} else if (tab === "apr") {
				var fee = MG.toCents(val("mg-fee")) || 0, fin = ff.get() === "1", loan = fin ? I.amount + fee : I.amount, net = fin ? I.amount : I.amount - fee;
				s = MG.schedule({ loan: loan, rate: I.rate, freq: I.freq, n: I.n, start: I.start });
				var A = MG.aprOf(s.rows.map(function (r) { return r.pay; }), net, I.F.ppy);
				if (!A) { $("mg-apr-out").innerHTML = ""; $("mg-apr-sentence").textContent = net <= 0 ? "The fees are as big as the loan." : "Can't work out an APR for these numbers."; }
				else {
					$("mg-apr-out").innerHTML = stat("APR", pct(A.apr, 3), { hero: true, sub: "interest rate " + I.rate.f + "%" }) + stat("Payment", moneyC(s.pay), { sub: "every " + I.F.per }) +
						stat("Total cost of borrowing", moneyC(s.paid - net), { cls: "tu-neg", sub: "interest " + moneyC(s.interest) + " + fees " + moneyC(fee) }) + stat("Effective yearly rate", pct(A.ear, 3), { sub: "with compounding" });
					$("mg-apr-sentence").textContent = "You receive " + moneyC(net) + (fin ? " and owe " + moneyC(loan) + " (the fees are added to the loan)" : " of the " + moneyC(I.amount) + " loan") + ". Paying " + moneyC(s.pay) + " every " + I.F.per +
						" makes the true yearly cost (APR) " + pct(A.apr, 3) + ", " + pct(A.apr - I.rate.f / 100, 3) + " more than the interest rate.";
				}
			}
			cur0 = s;
			drawLoan(s, compare, I.start);
		};
		function drawLoan(s, base, start) {
			var yrs = MG.yearRows(s), xs = yrs.map(function (y) { return y.y; });
			$("mg-chart-h").textContent = "Where your money goes each year" + (tab === "extra" ? " (with the extra payments)" : "");
			chart($("mg-bars"), { x: xs, bars: true, stacks: [{ v: yrs.map(function (y) { return y.prin / 100; }), cls: "mg-b-prin" }, { v: yrs.map(function (y) { return y.int / 100; }), cls: "mg-b-int" }],
				xLabel: function (t) { return "Yr " + t; }, readEl: $("mg-bars-readout"),
				read: function (i) { var y = yrs[i]; return "<b>Year " + y.y + "</b>" + (y.d1 ? " (" + esc(dateText(y.d0)) + " – " + esc(dateText(y.d1)) + ")" : "") + ": paid <b>" + esc(moneyC(y.pay)) + "</b> = principal " + esc(moneyC(y.prin)) + " + interest " + esc(moneyC(y.int)); } });
			// balance after each payment (down-sampled); with extras also the original schedule
			var nMax = Math.max(s.periods, base ? base.periods : 0), every = Math.max(1, Math.ceil(nMax / 300)), ks = [0], k;
			for (k = every; k < nMax; k += every) ks.push(k);
			if (ks[ks.length - 1] !== nMax) ks.push(nMax);
			function balAt(sc, kk) { return kk <= 0 ? sc.loan / 100 : kk > sc.periods ? 0 : sc.rows[kk - 1].bal / 100; }
			var avals = ks.map(function (kk) { return balAt(s, kk); }), bvals = base ? ks.map(function (kk) { return balAt(base, kk); }) : null;
			$("mg-bal-leg-b").hidden = !base;
			chart($("mg-bal"), { x: ks.map(function (kk) { return kk / s.ppy; }), lines: (bvals ? [{ v: bvals, cls: "mg-l-base" }] : []).concat([{ v: avals, cls: "mg-l-a" }]),
				stacks: [{ v: avals, cls: "mg-a-bal" }], xLabel: function (t) { return "Yr " + t; }, readEl: $("mg-bal-readout"),
				read: function (j) { var kk = ks[j]; return "<b>" + (kk ? "After payment " + kk : "Start") + "</b>" + (kk && start ? " (" + esc(dateText(MG.dateAt(start, kk, s.freq))) + ")" : "") + ": balance <b>" + esc(money(avals[j])) + "</b>" + (bvals ? " · without extras " + esc(money(bvals[j])) : ""); } });
			// schedule
			var ex = tab === "extra" && s.rows.some(function (r) { return r.ex > 0; });
			var head = ["Year", "Paid", "Interest", "Principal"]; if (ex) head.push("Extra"); head.push("Balance");
			var totEx = s.rows.reduce(function (a, r) { return a + r.ex; }, 0), foot = ["Total", moneyC(s.paid), moneyC(s.interest), moneyC(s.loan - (ex ? totEx : 0))]; if (ex) foot.push(moneyC(totEx)); foot.push(moneyC(0));
			expTable($("mg-table"), head, yrs.map(function (y) {
				var c = [y.y + (y.d1 ? ' <span class="mg-yd">' + esc(dateText(y.d1).replace(/^\w+ \d+, /, "")) + "</span>" : ""), moneyC(y.pay), moneyC(y.int), moneyC(y.prin - y.ex)]; if (ex) c.push(moneyC(y.ex)); c.push(moneyC(y.bal)); return { cells: c };
			}), function (idx) {
				var y = yrs[idx], out = [];
				for (var k = y.first; k <= y.last; k++) { var r = s.rows[k], c = ["#" + r.k + (r.d ? " · " + esc(dateText(r.d)) : ""), moneyC(r.pay), moneyC(r.int), moneyC(r.prin - r.ex)]; if (ex) c.push(moneyC(r.ex)); c.push(moneyC(r.bal)); out.push(c); }
				return out;
			}, foot);
		}
		function csv() {
			var s = cur0; if (!s) return "";
			var lines = [["Payment", "Date", "Payment amount", "Interest", "Principal", "Extra", "Balance"].join(",")];
			s.rows.forEach(function (r) { lines.push([r.k, r.d ? MG.isoDate(r.d) : "", (r.pay / 100).toFixed(2), (r.int / 100).toFixed(2), ((r.prin - r.ex) / 100).toFixed(2), (r.ex / 100).toFixed(2), (r.bal / 100).toFixed(2)].join(",")); });
			return lines.join("\n");
		}
		on($("mg-copy-csv"), "click", function () { copyText(csv().replace(/,/g, "\t"), "Schedule copied: paste it into a spreadsheet"); });
		on($("mg-dl-csv"), "click", function () { download("loan-schedule.csv", csv()); });
		on($("mg-copy-sum"), "click", function () {
			var t = tab === "pay" ? $("mg-sentence").textContent : tab === "borrow" ? $("mg-borrow-sentence").textContent : tab === "extra" ? $("mg-extra-sentence").textContent : $("mg-apr-sentence").textContent;
			copyText(t + " " + link(), "Summary copied");
		});
		on($("mg-copy-link"), "click", function () { copyText(link(), "Link copied"); });
		Array.prototype.forEach.call(root.querySelectorAll("input, select"), function (e) {
			on(e, e.tagName === "SELECT" || e.type === "date" ? "change" : "input", function () {
				if (e.closest("#mg-inputs")) Array.prototype.forEach.call(root.querySelectorAll("#mg-presets .tu-chip"), function (c) { c.setAttribute("aria-pressed", "false"); });
				soon();
			});
		});
		fillCurSelect(); curTags();
		setTab(S.tab || "pay");
		render(); watchResize();
	})();
})();
