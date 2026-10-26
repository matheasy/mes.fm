/* MES Debt Clock: pure parsing, estimating and formatting (no DOM, no network). Used by the page (window.MESDebt) AND by the
   aggregator function mes.fm/api/debt.js, which requires a byte-identical copy at mes.fm/api/_debt-lib.js (the tests check: after
   editing this file run `cp tool_apps_src/debt-clock/lib.js mes.fm/api/_debt-lib.js`). Tests: node tool_apps_src/debt-clock-tests.js.
   Every "live" number is an ESTIMATE between official updates: the last published figure plus the average change over a stated window. */
(function (root) {
	'use strict';
	var D = {};

	// ---------- small helpers ----------
	function num(x) { if (x === null || x === undefined || x === '' || x === '.' || x === 'null') return null; var n = +x; return isFinite(n) ? n : null; }
	D.num = num;
	D.round = function (x, d) { if (x === null || x === undefined || !isFinite(x)) return null; var k = Math.pow(10, d == null ? 2 : d); return Math.round(x * k) / k; };
	D.ymd = function (ms) { return new Date(ms).toISOString().slice(0, 10); };
	D.addDays = function (ymd, n) { return D.ymd(Date.parse(ymd + 'T00:00:00Z') + n * 864e5); };
	D.daysBetween = function (a, b) { return (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5; };
	D.last = function (a) { for (var i = a ? a.length - 1 : -1; i >= 0; i--) if (a[i] && a[i][1] !== null) return a[i]; return null; };
	D.thin = function (a, n) {
		if (!a || a.length <= n) return a ? a.slice() : [];
		var out = [], step = (a.length - 1) / (n - 1), i;
		for (i = 0; i < n; i++) out.push(a[Math.round(i * step)]);
		return out;
	};
	// last day of the month of a YYYY-MM-DD
	D.monthEnd = function (ymd) { var y = +ymd.slice(0, 4), m = +ymd.slice(5, 7); return D.ymd(Date.UTC(y, m, 0)); };
	D.SEC_YEAR = 365.2425 * 86400;
	// Treasury publishes "Debt to the Penny" as of the close of business of record_date; we pin that to 20:00 UTC (4 pm Eastern daylight time)
	D.asOfMs = function (ymd) { return Date.parse(ymd + 'T20:00:00Z'); };

	// ---------- Treasury Fiscal Data (api.fiscaldata.treasury.gov) ----------
	function rows(j) { if (!j || !Array.isArray(j.data)) throw new Error('no data in the Treasury answer'); return j.data; }
	// Debt to the Penny -> [[date, total, heldByPublic, intragovernmental]] oldest first
	D.parsePenny = function (j) {
		var out = rows(j).map(function (r) { return [r.record_date, num(r.tot_pub_debt_out_amt), num(r.debt_held_public_amt), num(r.intragov_hold_amt)]; })
			.filter(function (r) { return r[1] !== null; });
		out.sort(function (a, b) { return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0; });
		if (!out.length) throw new Error('no Debt to the Penny values');
		return out;
	};
	// Historical debt outstanding (fiscal-year ends since 1790) -> [[date, amount]] oldest first
	D.parseHistory = function (j) {
		var out = rows(j).map(function (r) { return [r.record_date, num(r.debt_outstanding_amt)]; }).filter(function (r) { return r[1] !== null; });
		out.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
		if (out.length < 50) throw new Error('debt history too short');
		return out;
	};
	// Interest expense: monthly rows by category. "INTEREST EXPENSE ON PUBLIC ISSUES" = paid to holders outside the government;
	// "... GOVT ACCOUNT SERIES" = credited to federal trust funds (intragovernmental). Returns month totals oldest first + trailing 12 months.
	D.parseInterest = function (j) {
		var by = {};
		rows(j).forEach(function (r) {
			var m = r.record_date, v = num(r.month_expense_amt); if (v === null) return;
			var o = by[m] || (by[m] = { date: m, pub: 0, gas: 0, fytdPub: 0, fytdGas: 0 }), pub = /PUBLIC/i.test(r.expense_catg_desc || '');
			o[pub ? 'pub' : 'gas'] += v; var f = num(r.fytd_expense_amt); if (f !== null) o[pub ? 'fytdPub' : 'fytdGas'] += f;
		});
		var months = Object.keys(by).sort().map(function (k) { return by[k]; });
		if (!months.length) throw new Error('no interest rows');
		var last12 = months.slice(-12), ttmPub = 0, ttmGas = 0;
		last12.forEach(function (o) { ttmPub += o.pub; ttmGas += o.gas; });
		var L = months[months.length - 1];
		return { asOf: L.date, months: months.map(function (o) { return [o.date, Math.round(o.pub), Math.round(o.gas)]; }), nMonths: last12.length,
			ttmPublic: Math.round(ttmPub), ttmTotal: Math.round(ttmPub + ttmGas), fytdPublic: Math.round(L.fytdPub), fytdTotal: Math.round(L.fytdPub + L.fytdGas), fyOfLast: D.fiscalYear(L.date) };
	};
	// US fiscal year: October 1 to September 30, named after the year it ends in
	D.fiscalYear = function (ymd) { var y = +ymd.slice(0, 4), m = +ymd.slice(5, 7); return m >= 10 ? y + 1 : y; };
	// September rows only (fytd at 30 Sep = the whole fiscal year) -> [[fy, public, total]]
	D.parseInterestFy = function (j) {
		var by = {};
		rows(j).forEach(function (r) {
			if (String(r.record_date).slice(5, 7) !== '09') return;
			var fy = +String(r.record_date).slice(0, 4), v = num(r.fytd_expense_amt); if (v === null) return;
			var o = by[fy] || (by[fy] = [fy, 0, 0]); if (/PUBLIC/i.test(r.expense_catg_desc || '')) o[1] += v; o[2] += v;
		});
		var out = Object.keys(by).sort().map(function (k) { var o = by[k]; return [o[0], Math.round(o[1]), Math.round(o[2])]; });
		if (!out.length) throw new Error('no fiscal-year interest');
		return out;
	};
	// Average interest rates on Treasury securities ("Total Interest-bearing Debt" rows) -> {latest:[date, %], series oldest first}
	D.parseAvgRates = function (j) {
		var s = rows(j).filter(function (r) { return /Total Interest-bearing Debt/i.test(r.security_desc || ''); })
			.map(function (r) { return [r.record_date, num(r.avg_interest_rate_amt)]; }).filter(function (p) { return p[1] !== null; });
		s.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
		if (!s.length) throw new Error('no average interest rate');
		return { latest: s[s.length - 1], series: s };
	};
	// Monthly Treasury Statement table 1 (receipts, outlays, deficit by month). The newest record_date has one block per fiscal year:
	// a "FY nnnn" header row, month rows, then "Year-to-Date". Deficit is positive, surplus negative (Treasury's sign).
	D.parseMts = function (j) {
		var r = rows(j); if (!r.length) throw new Error('empty MTS');
		var newest = r.reduce(function (m, x) { return x.record_date > m ? x.record_date : m; }, '');
		var cur = r.filter(function (x) { return x.record_date === newest; }).sort(function (a, b) { return num(a.line_code_nbr) - num(b.line_code_nbr); });
		var blocks = [], b = null;
		cur.forEach(function (x) {
			var d = String(x.classification_desc || ''), fy = /^FY\s*(\d{4})/.exec(d);
			if (fy) { b = { fy: +fy[1], months: [], ytd: null }; blocks.push(b); return; }
			if (!b) return;
			var row = { name: d, rcpt: num(x.current_month_gross_rcpt_amt), outly: num(x.current_month_gross_outly_amt), deficit: num(x.current_month_dfct_sur_amt) };
			if (/Year-to-Date/i.test(d)) b.ytd = row; else b.months.push(row);
		});
		blocks = blocks.filter(function (x) { return x.ytd; }).sort(function (a, c) { return a.fy - c.fy; });
		if (!blocks.length) throw new Error('no MTS year-to-date row');
		var c = blocks[blocks.length - 1], p = blocks.length > 1 ? blocks[blocks.length - 2] : null;
		return { asOf: newest, fy: c.fy, monthsIn: c.months.length, ytd: c.ytd, months: c.months, prev: p ? { fy: p.fy, ytd: p.ytd, months: p.months } : null };
	};

	// ---------- FRED (fredgraph.csv) ----------
	D.parseFredCsv = function (text) {
		var out = [], lines = String(text || '').split(/\r?\n/), i, c;
		if (!/^observation_date|^DATE/i.test(lines[0] || '')) throw new Error('not a FRED csv');
		for (i = 1; i < lines.length; i++) { c = lines[i].split(','); if (/^\d{4}-\d\d-\d\d$/.test(c[0])) out.push([c[0], num(c[1])]); }
		return out.filter(function (p) { return p[1] !== null; });
	};

	// ---------- the estimate: last official value + average daily change over a window ----------
	// rows = [[date, value, ...]] oldest first; col = which column; days = window length in calendar days.
	// The start point is the last published day on or before (latest - days).
	D.rateOver = function (rowsIn, days, col) {
		col = col || 1;
		var r = rowsIn.filter(function (x) { return x[col] !== null && x[col] !== undefined; });
		if (r.length < 2) return null;
		var to = r[r.length - 1], target = D.addDays(to[0], -days), from = null, i;
		for (i = r.length - 2; i >= 0; i--) if (r[i][0] <= target) { from = r[i]; break; }
		if (!from) from = r[0];
		var span = D.daysBetween(from[0], to[0]); if (span <= 0) return null;
		var perDay = (to[col] - from[col]) / span;
		return { from: [from[0], from[col]], to: [to[0], to[col]], days: span, perDay: perDay, perSec: perDay / 86400, perMs: perDay / 864e5, asked: days };
	};
	// value at time `now` (ms) given base value at t0 (ms) and a rate per ms
	D.estimate = function (base, t0, perMs, now) { return base + perMs * (now - t0); };
	// when does the estimate reach `target`? (null if it never does at this rate)
	D.reachAt = function (base, t0, perMs, target) { if (!perMs || (target - base) / perMs < 0) return null; return t0 + (target - base) / perMs; };
	D.nextMilestone = function (v, step) { return (Math.floor(v / step) + 1) * step; };

	// ---------- shares ----------
	// counts = {people, households, taxpayers}; returns the amount per each that is a positive number
	D.perHead = function (total, counts) {
		var out = {}; ['people', 'households', 'taxpayers'].forEach(function (k) { var c = counts && counts[k]; out[k] = c > 0 ? total / c : null; });
		return out;
	};
	// IRS: individual income tax returns filed in a year (rounded). Not fetched live: see TAXPAYERS_NOTE.
	D.TAXPAYERS = 160e6;
	D.TAXPAYERS_NOTE = 'about 160 million individual income tax returns filed a year (IRS filing statistics, rounded; not updated live)';

	// ---------- IMF DataMapper (www.imf.org/external/datamapper/api/v1) ----------
	// debt = GGXWDG_NGDP (general government gross debt, % of GDP), gdp = NGDPD (GDP, billions of US dollars), pop = LP (population, millions),
	// labels = /countries answer. Keeps only `years`. Codes that are not 3-letter countries (WEOWORLD, EURO, ADVEC...) go to `groups`.
	D.GROUPS = { WEOWORLD: 'World', ADVEC: 'Advanced economies', OEMDC: 'Emerging and developing economies', EURO: 'Euro area', EU: 'European Union' };
	D.parseImf = function (debt, gdp, pop, labels, years) {
		var dv = debt && debt.values && debt.values.GGXWDG_NGDP, gv = gdp && gdp.values && gdp.values.NGDPD, pv = pop && pop.values && pop.values.LP;
		if (!dv || !gv) throw new Error('IMF answer has no values');
		var names = (labels && labels.countries) || {}, rowsOut = [], groups = {};
		function pick(o) { var r = {}; years.forEach(function (y) { var v = o && num(o[y]); if (v !== null) r[y] = v; }); return r; }
		Object.keys(dv).forEach(function (code) {
			var rec = { code: code, d: pick(dv[code]), g: pick(gv[code]), p: pick(pv && pv[code]) };
			if (D.GROUPS[code]) { rec.name = D.GROUPS[code]; groups[code] = rec; return; }
			if (!/^[A-Z]{3}$/.test(code) || !names[code]) return;
			rec.name = names[code].label;
			if (Object.keys(rec.d).length) rowsOut.push(rec);
		});
		rowsOut.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
		if (rowsOut.length < 50) throw new Error('too few IMF countries');
		return { years: years, rows: rowsOut, groups: groups };
	};
	// one year's table: debt in US dollars = % of GDP x GDP
	D.countryTable = function (imf, year) {
		var y = String(year);
		return imf.rows.map(function (r) {
			var pct = r.d[y], g = r.g[y], p = r.p[y];
			if (pct == null) return null;
			var debt = g != null ? pct / 100 * g * 1e9 : null;
			return { code: r.code, name: r.name, pct: pct, gdp: g != null ? g * 1e9 : null, debt: debt, pop: p != null ? p * 1e6 : null, perPerson: debt != null && p ? debt / (p * 1e6) : null };
		}).filter(Boolean);
	};
	// world government debt for a year: sum of country debt (countries with both % and GDP), and the IMF's own world ratio x world GDP
	D.worldTotal = function (imf, year) {
		var t = D.countryTable(imf, year), sum = 0, gdpSum = 0, n = 0;
		t.forEach(function (r) { if (r.debt != null) { sum += r.debt; gdpSum += r.gdp; n++; } });
		var w = imf.groups.WEOWORLD, y = String(year), viaRatio = w && w.d[y] != null && w.g[y] != null ? w.d[y] / 100 * w.g[y] * 1e9 : null;
		return { year: +year, sum: sum, n: n, gdpSum: gdpSum, pctOfGdp: gdpSum ? sum / gdpSum * 100 : null, worldPct: w ? w.d[y] : null, viaRatio: viaRatio, pop: w && w.p[y] ? w.p[y] * 1e6 : null };
	};
	// a straight line between two year-end estimates, read at `now` (it extrapolates past the second year too)
	D.yearLine = function (a, b, ya, yb) {
		var ta = Date.parse(ya + '-12-31T12:00:00Z'), tb = Date.parse(yb + '-12-31T12:00:00Z'), perMs = (b - a) / (tb - ta);
		return { base: b, t0: tb, perMs: perMs, perDay: perMs * 864e5, from: ya, to: yb };
	};

	// ---------- Statistics Canada WDS + Bank of Canada Valet ----------
	// getDataFromCubePidCoordAndLatestNPeriods / getDataFromVectorsAndLatestNPeriods answers -> [[date, value x scale]] oldest first
	D.parseStatcan = function (obj) {
		if (!obj || obj.status !== 'SUCCESS' || !obj.object) throw new Error('Statistics Canada did not answer');
		var o = obj.object, out = [];
		(o.vectorDataPoint || []).forEach(function (p) {
			var v = num(p.value); if (v === null) return;
			var k = Math.pow(10, num(p.scalarFactorCode) || 0); out.push([p.refPer, v * k]);
		});
		out.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
		if (!out.length) throw new Error('no Statistics Canada values');
		return out;
	};
	D.parseValet = function (j, id) {
		var out = ((j && j.observations) || []).map(function (o) { return [o.d, num(o[id] && o[id].v)]; }).filter(function (p) { return p[1] !== null; });
		out.sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
		if (!out.length) throw new Error('no ' + id + ' values');
		return out;
	};
	// Canada's federal debt clock: monthly accumulated deficit (end of each month), rate = average change over the last `months` months
	D.canadaClock = function (fed, months) {
		var r = fed.map(function (p) { return [D.monthEnd(p[0]), p[1]]; }), rate = D.rateOver(r, Math.round((months || 12) * 30.44));
		if (!rate) return null;
		var to = r[r.length - 1];
		return { base: to[1], date: to[0], t0: Date.parse(to[0] + 'T23:59:59Z'), rate: rate };
	};

	// ---------- formatting ----------
	var CUR = { USD: ['$', 'US$'], CAD: ['$', 'C$'] };
	D.commas = function (v, d) {
		if (v === null || v === undefined || !isFinite(v)) return '–';
		var neg = v < 0, s = Math.abs(v).toFixed(d || 0), p = s.split('.');
		p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
		return (neg ? '−' : '') + p.join('.');
	};
	// $40,444,342,709,389
	D.full = function (v, cur, d) { if (v === null || v === undefined || !isFinite(v)) return '–'; var s = D.commas(v, d); return s.charAt(0) === '−' ? '−' + D.sym(cur) + s.slice(1) : D.sym(cur) + s; };
	D.sym = function (cur) { return cur === 'CAD' ? 'C$' : cur === 'USDx' ? 'US$' : '$'; };
	// $40.44 trillion / $1.29 billion / $12,345
	D.big = function (v, cur, digits) {
		if (v === null || v === undefined || !isFinite(v)) return '–';
		var a = Math.abs(v), sg = v < 0 ? '−' : '', s = D.sym(cur), dg = digits == null ? 2 : digits;
		if (a >= 1e12) return sg + s + (a / 1e12).toFixed(dg) + ' trillion';
		if (a >= 1e9) return sg + s + (a / 1e9).toFixed(dg) + ' billion';
		if (a >= 1e6) return sg + s + (a / 1e6).toFixed(dg) + ' million';
		return sg + s + D.commas(a, a < 100 ? 2 : 0);
	};
	// short axis labels: 40T, 500B, 3M
	D.short = function (v) {
		var a = Math.abs(v), sg = v < 0 ? '−' : '';
		if (a >= 1e12) return sg + +(a / 1e12).toFixed(a >= 1e13 ? 0 : 1) + 'T';
		if (a >= 1e9) return sg + +(a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
		if (a >= 1e6) return sg + +(a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
		if (a >= 1e3) return sg + +(a / 1e3).toFixed(0) + 'K';
		return sg + +a.toFixed(2);
	};
	D.pct = function (v, d) { return v === null || v === undefined || !isFinite(v) ? '–' : D.commas(v, d == null ? 1 : d) + '%'; };
	// convert between USD and CAD with usdcad = Canadian dollars per US dollar
	D.convert = function (v, from, to, usdcad) { if (v == null || from === to || !usdcad) return v; return from === 'USD' ? v * usdcad : v / usdcad; };

	// ---------- glossary (the "?" buttons) ----------
	D.GLOSSARY = {
		total: ['Total public debt outstanding', 'Everything the US Treasury owes: debt held by the public plus intragovernmental holdings. Treasury publishes it every business day ("Debt to the Penny"). This is the number the debt ceiling applies to (almost all of it).'],
		public: ['Debt held by the public', 'Treasury bills, notes, bonds and savings bonds owned by anyone outside the federal government: people, banks, pension funds, mutual funds, state governments, foreign governments and the Federal Reserve. Economists usually use this part when they compare debt with the size of the economy.'],
		intragov: ['Intragovernmental holdings', 'Debt one part of the government owes another, mostly special Treasury securities held by trust funds such as Social Security and Medicare and federal employee retirement funds. It is real money owed to future beneficiaries, but it is an IOU inside the government, which is why some measures leave it out.'],
		ceiling: ['Debt ceiling (debt limit)', 'The legal maximum Congress allows the Treasury to borrow. It does not approve new spending: it lets the Treasury pay for spending and tax cuts Congress already passed. When the debt reaches it, Treasury uses accounting steps ("extraordinary measures") until Congress raises or suspends the limit; the total then often jumps as those steps are undone. This page does not show the limit itself because there is no simple live source for it.'],
		interest: ['Interest expense', 'What the government pays to borrow. "Public issues" is interest paid to holders outside the government (the cost that comes out of the budget in cash); the government also credits interest to its own trust funds. Treasury publishes it monthly; per second / day / year here is the last 12 months spread evenly.'],
		avgrate: ['Average interest rate', 'The average rate on all interest-bearing Treasury debt, from Treasury\'s monthly table. It changes slowly because most debt was borrowed months or years ago at the rates of that time; new borrowing pays today\'s rates.'],
		debtgdp: ['Debt-to-GDP', 'Debt divided by the value of everything the country produces in a year (gross domestic product). It compares the debt with the size of the economy that has to carry it, the way a mortgage is compared with income. The live figure here uses total public debt and the latest quarterly GDP at an annual rate.'],
		deficit: ['Deficit', 'How much more the government spent than it took in over a period. The deficit adds to the debt; a surplus (receipts above spending) lets it shrink. The fiscal year runs October 1 to September 30. The debt can grow faster or slower than the deficit because of cash-balance changes and loans.'],
		estimate: ['How the ticking number is estimated', 'Official figures arrive once a business day (US), once a month (Canada) or once or twice a year (IMF world numbers). Between updates this page starts from the last official figure and adds the average change per second over the window you choose. Real borrowing happens in lumps on auction days, so the true number at any moment can be billions above or below the estimate.'],
		perperson: ['Per person, household and taxpayer', 'The total divided by the number of people, households or income tax returns. It is a way to picture the size, not a bill: nobody is sent an invoice, and the debt is paid (or rolled over) from future taxes and borrowing.'],
		gross: ['General government gross debt (IMF)', 'The IMF\'s measure for comparing countries: all debt of the central, state or provincial and local governments and social security funds, as a percentage of GDP. It is larger than a single national government\'s debt (Canada\'s provinces owe a lot, for example) and recent years are IMF estimates or projections.'],
		cafed: ['Canada\'s federal debt (accumulated deficit)', 'Statistics Canada\'s monthly "federal debt": the government of Canada\'s total liabilities minus its financial and non-financial assets, i.e. all past deficits minus surpluses. It does not include the provinces. Gross debt (all liabilities before subtracting assets) is shown next to it.'],
		world: ['World government debt', 'Sum over every country the IMF covers of (government debt % of GDP) x (GDP in US dollars) for the chosen year, plus the IMF\'s own world ratio for comparison. Exchange rates move these totals: a stronger dollar makes other countries\' debt look smaller in dollars.']
	};

	if (typeof module !== 'undefined' && module.exports) module.exports = D;
	else root.MESDebt = D;
})(typeof window !== 'undefined' ? window : this);
