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

/* MES Debt Clock UI. Data = /api/debt (one aggregator, edge-cached about an hour); parsing / maths = MESDebt (lib.js).
   ?mock=1 and local previews (no /api there) read the committed snapshot mes.fm/debt-clock/data/sample.json; when one source fails
   live, that part falls back to the snapshot too and the page says so. Settings in localStorage mes-debt-clock:v1. Informational only. */
(function () {
	'use strict';
	var D = window.MESDebt, $ = function (id) { return document.getElementById(id); }, root = $('dc');
	if (!D || !root) return;
	var KEY = 'mes-debt-clock:v1', KEYS = ['tab', 'cur', 'uw', 'cw', 'hr', 'hs', 'wm', 'wsort', 'wdir', 'year', 'big'];
	var st = { tab: 'us', cur: 'native', uw: 90, cw: 12, hr: 'all', hs: 'log', wm: 'pct', wsort: 'pct', wdir: -1, year: null, big: 'us' };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || '{}'); KEYS.forEach(function (k) { if (sv[k] != null) st[k] = sv[k]; }); } catch (e) {}
	var qs = new URLSearchParams(location.search), MOCK = qs.get('mock') === '1' || /^(127\.0\.0\.1|localhost)$/.test(location.hostname);
	if (/^(us|world|ca)$/.test(qs.get('tab') || '')) st.tab = qs.get('tab');
	function save() { try { var o = {}; KEYS.forEach(function (k) { o[k] = st[k]; }); localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	function q(k) { var g = D.GLOSSARY[k]; return g ? '<button type="button" class="dc-q" data-g="' + k + '" aria-label="' + esc('What is ' + g[0] + '?') + '">?</button>' : ''; }
	var data = null, stale = {}, sample = null, opened = Date.now();
	function src(n) { return data && data.sources[n] && data.sources[n].ok ? data.sources[n].data : null; }
	function dlong(s) { if (!s) return ''; var d = new Date(s.length === 10 ? s + 'T12:00:00Z' : s); return isNaN(d) ? s : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: s.length === 10 ? 'UTC' : undefined }); }
	function dmon(s) { var d = new Date(s.slice(0, 7) + '-15T00:00:00Z'); return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', timeZone: 'UTC' }); }

	// ---------- currency ----------
	function fx() { var f = src('fx'); return f && f.usdcad; }
	function curOf(native) { return st.cur === 'native' || !fx() ? native : st.cur; }
	function money(v, native, kind, dg) { var c = curOf(native), x = D.convert(v, native, c, fx()); return kind === 'full' ? D.full(x, c, dg) : D.big(x, c, dg); }
	function moneySmall(v, native) { var c = curOf(native), x = D.convert(v, native, c, fx()); return D.full(x, c, Math.abs(x) < 10 ? 2 : 0); }

	// ---------- tabs ----------
	var TABS = ['us', 'world', 'ca'];
	function showTab(t, focus) {
		st.tab = t; save();
		[].forEach.call($('dc-tabs').querySelectorAll('[role=tab]'), function (b) { var on = b.getAttribute('data-tab') === t; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
		TABS.forEach(function (x) { $('dc-p-' + x).hidden = x !== t; });
		if (data) drawTab(t);
	}
	$('dc-tabs').addEventListener('click', function (e) { var b = e.target.closest('[role=tab]'); if (b) showTab(b.getAttribute('data-tab')); });
	$('dc-tabs').addEventListener('keydown', function (e) { var i = TABS.indexOf(st.tab); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); showTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : 2)) % 3], true); } });
	$('dc-cur').value = st.cur;
	$('dc-cur').addEventListener('change', function () { st.cur = this.value; save(); buildClocks(); drawTab(st.tab); });

	// ---------- glossary popover ----------
	var pop = $('dc-pop'), popFor = null;
	function closePop() { pop.hidden = true; if (popFor) popFor.setAttribute('aria-expanded', 'false'); popFor = null; }
	root.addEventListener('click', function (e) {
		var b = e.target.closest('.dc-q');
		if (b) {
			e.preventDefault(); e.stopPropagation();
			if (popFor === b) return closePop();
			var g = D.GLOSSARY[b.getAttribute('data-g')]; if (!g) return;
			closePop(); popFor = b; b.setAttribute('aria-expanded', 'true');
			pop.querySelector('.dc-pop__t').textContent = g[0]; pop.querySelector('.dc-pop__p').textContent = g[1]; pop.hidden = false;
			var r = b.getBoundingClientRect(), w = Math.min(340, window.innerWidth - 24), left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), window.innerWidth - w - 12);
			pop.style.width = w + 'px'; pop.style.left = left + 'px';
			var h = pop.offsetHeight, top = r.bottom + 8; if (top + h > window.innerHeight - 8 && r.top - h - 8 > 8) top = r.top - h - 8;
			pop.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + 'px';
			return;
		}
		if (!pop.hidden && !e.target.closest('.dc-pop')) closePop();
	});
	pop.querySelector('.dc-pop__x').onclick = closePop;
	window.addEventListener('scroll', function () { if (!pop.hidden) closePop(); }, { passive: true });

	// ---------- segmented controls ----------
	function segs() {
		[].forEach.call(root.querySelectorAll('[data-set]'), function (g) { var k = g.getAttribute('data-set'); [].forEach.call(g.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === String(st[k]))); }); });
		[].forEach.call(root.querySelectorAll('[data-win]'), function (g) { var k = g.getAttribute('data-win') === 'us' ? 'uw' : 'cw'; [].forEach.call(g.querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-d') === +st[k])); }); });
	}
	root.addEventListener('click', function (e) {
		var b = e.target.closest('[data-set] button');
		if (b) { st[b.parentNode.getAttribute('data-set')] = b.getAttribute('data-v'); save(); segs(); drawTab(st.tab); return; }
		b = e.target.closest('[data-win] button');
		if (b) { st[b.parentNode.getAttribute('data-win') === 'us' ? 'uw' : 'cw'] = +b.getAttribute('data-d'); save(); segs(); buildClocks(); drawTab(st.tab); return; }
		b = e.target.closest('[data-big]'); if (b) return openBig(b.getAttribute('data-big'), false);
		b = e.target.closest('[data-fs]'); if (b) return openBig(b.getAttribute('data-fs'), true);
	});

	// ---------- charts: plain SVG sized to the box, hover / touch readout ----------
	var tip = $('dc-tip');
	function niceTicks(y0, y1, n) { var st2 = (y1 - y0) / (n || 4), m = Math.pow(10, Math.floor(Math.log10(st2 || 1))), s2 = [1, 2, 2.5, 5, 10].map(function (k) { return k * m; }).find(function (k) { return k >= st2; }) || st2, r = [], v; for (v = Math.ceil(y0 / s2) * s2; v <= y1 + 1e-9 * Math.abs(y1); v += s2) r.push(+v.toPrecision(12)); return r; }
	// o: {series:[{pts:[[ms, v, label]], cls, name}], log, bars, fy (tick format), fv (value format), fx (x label), h, zero}
	function chart(box, o) {
		var W = Math.max(260, box.clientWidth || 600), H = o.h || (W < 500 ? 200 : 250), pl = W < 420 ? 40 : 50, pr = 10, pt = 12, pb = 24, all = [];
		o.series.forEach(function (s) { s.p = s.pts.filter(function (p) { return p[1] != null && (!o.log || p[1] > 0); }); all = all.concat(s.p); });
		if (!all.length) { box.innerHTML = '<p class="tu-note">No data.</p>'; return; }
		var xs = all.map(function (p) { return p[0]; }), ys = all.map(function (p) { return p[1]; });
		var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
		if (o.bars) { var bw = (x1 - x0) / Math.max(1, all.length - 1) / 2; x0 -= bw; x1 += bw; }
		var T = o.log ? function (v) { return Math.log10(v); } : function (v) { return v; };
		if (o.log) { y0 = Math.pow(10, Math.floor(Math.log10(y0))); y1 = Math.pow(10, Math.ceil(Math.log10(y1))); }
		else { if (o.zero !== false) y0 = Math.min(0, y0); var pad = (y1 - y0) * 0.06 || 1; y1 += pad; if (y0 < 0) y0 -= pad; }
		var X = function (t) { return pl + (x1 === x0 ? 0.5 : (t - x0) / (x1 - x0)) * (W - pl - pr); }, Y = function (v) { return pt + (1 - (T(v) - T(y0)) / (T(y1) - T(y0) || 1)) * (H - pt - pb); }, out = [];
		var ticks = []; if (o.log) { for (var e = Math.log10(y0); e <= Math.log10(y1) + 1e-9; e++) ticks.push(Math.pow(10, e)); if (ticks.length > 7) ticks = ticks.filter(function (v, i) { return i % 2 === 0; }); } else ticks = niceTicks(y0, y1, W < 500 ? 3 : 4);
		ticks.forEach(function (v) { if (v < y0 || v > y1) return; out.push('<line class="dc-grid' + (v === 0 ? ' dc-zero' : '') + '" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"></line><text class="dc-ax" x="' + (pl - 5) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + esc((o.fy || D.short)(v)) + '</text>'); });
		var span = x1 - x0, nx = W < 500 ? 3 : 5;
		for (var i = 0; i <= nx; i++) { var t = x0 + span * i / nx; out.push('<text class="dc-ax" x="' + X(t).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (i === 0 ? 'start' : i === nx ? 'end' : 'middle') + '">' + esc((o.fx || function (ms) { var d = new Date(ms); return span > 4 * 365 * 864e5 ? String(d.getUTCFullYear()) : d.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' }); })(t)) + '</text>'); }
		o.series.forEach(function (s) {
			if (!s.p.length) return;
			if (o.bars) {
				var w = Math.max(1.5, (W - pl - pr) / s.p.length * 0.7), zy = Y(o.log ? y0 : 0);
				s.p.forEach(function (p) { var y = Y(p[1]); out.push('<rect class="dc-bar ' + (s.cls || '') + (p[1] < 0 ? ' dc-bar--neg' : '') + '" x="' + (X(p[0]) - w / 2).toFixed(1) + '" y="' + Math.min(y, zy).toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(1, Math.abs(zy - y)).toFixed(1) + '"></rect>'); });
				return;
			}
			var d = s.p.map(function (p, k) { return (k ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join('');
			if (s.fill) out.push('<path class="dc-fill ' + s.cls + '" d="' + d + 'L' + X(s.p[s.p.length - 1][0]).toFixed(1) + ' ' + (H - pb) + 'L' + X(s.p[0][0]).toFixed(1) + ' ' + (H - pb) + 'Z"></path>');
			out.push('<path class="dc-line ' + (s.cls || '') + '" d="' + d + '"></path>');
		});
		out.push('<line class="dc-cross" x1="-9" x2="-9" y1="' + pt + '" y2="' + (H - pb) + '"></line><circle class="dc-dot" r="4" cx="-9" cy="-9"></circle>');
		box.innerHTML = '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'Chart') + '">' + out.join('') + '</svg>';
		var svg = box.firstChild, cross = svg.querySelector('.dc-cross'), dot = svg.querySelector('.dc-dot'), s0 = o.series[0];
		function at(ev) {
			var r = svg.getBoundingClientRect(), mx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, tt = x0 + (mx - pl) / (W - pl - pr) * span, p = null, bd = Infinity;
			s0.p.forEach(function (q2) { var dd = Math.abs(q2[0] - tt); if (dd < bd) { bd = dd; p = q2; } });
			if (!p) return hide();
			cross.setAttribute('x1', X(p[0])); cross.setAttribute('x2', X(p[0])); dot.setAttribute('cx', X(p[0])); dot.setAttribute('cy', Y(p[1]));
			tip.hidden = false; tip.innerHTML = '<b>' + esc(p[2]) + '</b><br>' + esc((o.fv || o.fy || D.short)(p[1]));
			var tw = tip.offsetWidth, x = r.left + X(p[0]); tip.style.left = Math.min(Math.max(8, x - tw / 2), window.innerWidth - tw - 8) + 'px'; tip.style.top = Math.max(8, r.top + 4 - tip.offsetHeight - 6) + 'px';
		}
		function hide() { tip.hidden = true; cross.setAttribute('x1', -9); cross.setAttribute('x2', -9); dot.setAttribute('cx', -9); }
		svg.addEventListener('pointermove', at); svg.addEventListener('pointerdown', at); svg.addEventListener('pointerleave', hide);
		box._redraw = function () { chart(box, o); };
	}
	// horizontal bars (country chart)
	function hbars(box, items, fv) {
		if (!items.length) { box.innerHTML = '<p class="tu-note">No countries to show.</p>'; return; }
		var mx = Math.max.apply(null, items.map(function (x) { return x.v; })) || 1;
		box.innerHTML = '<ol class="dc-hb">' + items.map(function (x) { return '<li class="' + (x.code === 'USA' ? 'dc-hb--us' : x.code === 'CAN' ? 'dc-hb--ca' : '') + '"><span class="dc-hb__n">' + esc(x.name) + '</span><span class="dc-hb__t"><i style="width:' + Math.max(0.5, x.v / mx * 100).toFixed(1) + '%"></i></span><span class="dc-hb__v">' + esc(fv(x.v)) + '</span></li>'; }).join('') + '</ol>';
	}
	var ro = window.ResizeObserver ? new ResizeObserver(function (ents) { ents.forEach(function (en) { var b = en.target; if (b._w !== Math.round(en.contentRect.width) && b._redraw) { b._w = Math.round(en.contentRect.width); b._redraw(); } }); }) : null;
	if (ro) [].forEach.call(root.querySelectorAll('.dc-chart'), function (b) { ro.observe(b); });
	function ms(s) { return Date.parse(s.length === 4 ? s + '-07-01T00:00:00Z' : s.slice(0, 10) + 'T00:00:00Z'); }

	// ---------- the clocks (each = base value at t0 + perMs; values in the clock's own currency) ----------
	var CL = {};
	function usCounts() {
		var f = src('fred') || {}, pop = f.pop && D.last(f.pop), hh = f.hh && D.last(f.hh);
		return { people: pop ? pop[1] * 1000 : null, households: hh ? hh[1] * 1000 : null, taxpayers: D.TAXPAYERS, popDate: pop && pop[0], hhDate: hh && hh[0] };
	}
	function buildClocks() {
		CL = {};
		var p = src('penny');
		if (p) {
			var r = D.rateOver(p.rows, st.uw), rp = D.rateOver(p.rows, st.uw, 2), ri = D.rateOver(p.rows, st.uw, 3);
			if (r) CL.us = { cur: 'USD', base: p.latest.total, t0: D.asOfMs(p.latest.date), perMs: r.perMs, rate: r, date: p.latest.date, pub: [p.latest.public, rp ? rp.perMs : 0], intra: [p.latest.intragov, ri ? ri.perMs : 0], label: 'US national debt', counts: usCounts() };
		}
		var imf = src('imf');
		if (imf) {
			var y = new Date().getUTCFullYear(), a = D.worldTotal(imf, y - 1), b = D.worldTotal(imf, y);
			if (a.viaRatio && b.viaRatio) { var l = D.yearLine(a.viaRatio, b.viaRatio, y - 1, y); CL.world = { cur: 'USD', base: l.base, t0: l.t0, perMs: l.perMs, line: l, a: a, b: b, label: 'World government debt', pop: b.pop }; }
		}
		var c = src('canada');
		if (c && c.fed) {
			var cc = D.canadaClock(c.fed, st.cw);
			if (cc) CL.ca = { cur: 'CAD', base: cc.base, t0: cc.t0, perMs: cc.rate.perMs, rate: cc.rate, date: cc.date, label: 'Canada’s federal debt', pop: c.pop && c.pop[1], gdp: c.gdp && c.gdp[1] };
		}
	}
	function now(k, t) { var c = CL[k]; return c ? D.estimate(c.base, c.t0, c.perMs, t || Date.now()) : null; }
	function perSecText(c) { var v = D.convert(c.perMs * 1000, c.cur, curOf(c.cur), fx()); return (v >= 0 ? '+' : '') + D.full(v, curOf(c.cur), Math.abs(v) < 100 ? 2 : 0) + ' a second'; }

	// ticking: update visible numbers ~10 times a second (setInterval, so it keeps going where requestAnimationFrame is paused)
	function tick() {
		var t = Date.now();
		['us', 'world', 'ca'].forEach(function (k) {
			var c = CL[k], el = $('dc-' + (k === 'world' ? 'w' : k) + '-num'); if (!c || !el || el.offsetParent === null) return;
			el.textContent = money(now(k, t), c.cur, 'full');
			var so = $('dc-' + k + '-since'); if (so) so.textContent = (c.perMs >= 0 ? '+' : '') + moneySmall(c.perMs * (t - opened), c.cur);
			var pp = $('dc-' + k + '-pp'); if (pp) { var cnt = k === 'us' ? c.counts.people : c.pop; if (cnt) pp.textContent = moneySmall(now(k, t) / cnt, c.cur); }
		});
		if (!bv.hidden) bigTick(t);
	}
	setInterval(tick, 100);

	// ---------- US tab ----------
	function tile(label, val, sub, g, id) { return '<div class="tu-stat dc-tile"><span class="tu-stat__label">' + label + (g ? ' ' + q(g) : '') + '</span><span class="tu-stat__value"' + (id ? ' id="' + id + '"' : '') + '>' + val + '</span>' + (sub ? '<span class="tu-stat__sub">' + sub + '</span>' : '') + '</div>'; }
	function err(n) { var s = data && data.sources[n]; return '<p class="tu-note dc-err">Could not load this right now' + (s && s.error ? ' (' + esc(s.error) + ')' : '') + '.</p>'; }
	function staleNote(names) { var s = names.filter(function (n) { return stale[n]; }); return s.length ? ' <span class="dc-stale">Live data did not answer; showing the saved copy from ' + esc(dlong(sample && sample.generated)) + '.</span>' : ''; }
	function drawUS() {
		var c = CL.us, p = src('penny'), f = src('fred') || {};
		if (!c) { $('dc-us-num').textContent = '–'; $('dc-us-how').innerHTML = err('penny'); return; }
		$('dc-us-rate').textContent = perSecText(c) + ' · ' + money(c.perMs * 864e5, 'USD', 'big') + ' a day';
		$('dc-us-how').innerHTML = 'Treasury&rsquo;s last figure: <b>' + esc(money(c.base, 'USD', 'full')) + '</b> at the close of business on ' + esc(dlong(c.date)) + '. Since then the page adds the average change of ' + esc(money(c.rate.perDay, 'USD', 'big')) + ' a day from ' + esc(dlong(c.rate.from[0])) + ' to ' + esc(dlong(c.rate.to[0])) + ' (' + Math.round(c.rate.days) + ' days). Treasury updates once a business day.' + staleNote(['penny']);
		var cn = c.counts, est = now('us'), gdp = f.gdp && D.last(f.gdp), it = src('interest'), mts = src('mts'), o = [];
		o.push(tile('Per person', cn.people ? moneySmall(est / cn.people, 'USD') : '–', cn.people ? (cn.people / 1e6).toFixed(1) + ' million people (Census via FRED, ' + esc(dmon(cn.popDate)) + ')' : 'population did not load', 'perperson', 'dc-us-pp'));
		o.push(tile('Per household', cn.households ? moneySmall(est / cn.households, 'USD') : '–', cn.households ? (cn.households / 1e6).toFixed(1) + ' million households (Census, ' + esc(cn.hhDate.slice(0, 4)) + ')' : '', 'perperson'));
		o.push(tile('Per taxpayer', moneySmall(est / cn.taxpayers, 'USD'), esc(D.TAXPAYERS_NOTE), 'perperson'));
		if (gdp) o.push(tile('Debt-to-GDP', D.pct(est / (gdp[1] * 1e9) * 100), 'GDP ' + esc(money(gdp[1] * 1e9, 'USD', 'big')) + ' a year (' + esc(dmon(gdp[0])) + ' quarter, annual rate)', 'debtgdp'));
		o.push(tile('Added since you opened this page', '<span id="dc-us-since">$0</span>', 'at the estimated rate', 'estimate'));
		var ms1 = D.nextMilestone(est, 1e12), at = D.reachAt(c.base, c.t0, c.perMs, ms1);
		o.push(tile('Next trillion', esc(money(ms1, 'USD', 'big', 0)), at ? 'around ' + esc(new Date(at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })) + ' at this rate' : 'not at the current rate (the debt is falling)'));
		if (it) {
			var ps = it.ttmPublic / D.SEC_YEAR;
			o.push(tile('Interest, per second', esc(moneySmall(ps, 'USD')), esc(money(ps * 86400, 'USD', 'big')) + ' a day · ' + esc(money(it.ttmPublic, 'USD', 'big')) + ' in the 12 months to ' + esc(dmon(it.asOf)), 'interest'));
			if (mts) {
				var all = (mts.prev ? mts.prev.months : []).concat(mts.months).slice(-12), rc = 0, df = 0; all.forEach(function (m) { rc += m.rcpt || 0; df += m.deficit || 0; });
				if (rc) o.push(tile('Interest per tax dollar', Math.round(it.ttmPublic / rc * 100) + '¢', 'of every dollar the government took in over the last 12 months', 'interest'));
				o.push(tile('Deficit, per second', esc(moneySmall(df / D.SEC_YEAR, 'USD')), esc(money(df, 'USD', 'big')) + ' over the last 12 months', 'deficit'));
			}
		}
		if (mts) o.push(tile('Deficit, fiscal year ' + mts.fy + (mts.monthsIn < 12 ? ' so far' : ''), esc(money(mts.ytd.deficit, 'USD', 'big')), mts.monthsIn < 12 ? mts.monthsIn + ' of 12 months (to ' + esc(dlong(mts.asOf)) + ')' : 'the whole year, October ' + (mts.fy - 1) + ' to September ' + mts.fy, 'deficit'));
		var ar = src('avgRate'); if (ar) o.push(tile('Average interest rate', D.pct(ar.latest[1], 2), 'on all interest-bearing debt, ' + esc(dmon(ar.latest[0])), 'avgrate'));
		$('dc-us-tiles').innerHTML = o.join('');
		// public vs intragovernmental
		var pub = c.pub[0], intra = c.intra[0], tot = pub + intra;
		$('dc-split').innerHTML = '<div class="dc-split" role="img" aria-label="' + esc('Held by the public ' + D.pct(pub / tot * 100) + ', intragovernmental ' + D.pct(intra / tot * 100)) + '"><span class="dc-split__a" style="width:' + (pub / tot * 100).toFixed(2) + '%"></span><span class="dc-split__b" style="width:' + (intra / tot * 100).toFixed(2) + '%"></span></div>' +
			'<div class="dc-legend"><span><i class="dc-sw dc-sw--a"></i>Held by the public: <b>' + esc(money(pub, 'USD', 'big')) + '</b> (' + D.pct(pub / tot * 100) + ', ' + esc(money(c.pub[1] * 864e5, 'USD', 'big')) + ' a day on average)</span><span><i class="dc-sw dc-sw--b"></i>Intragovernmental: <b>' + esc(money(intra, 'USD', 'big')) + '</b> (' + D.pct(intra / tot * 100) + ', ' + esc(money(c.intra[1] * 864e5, 'USD', 'big')) + ' a day)</span></div><p class="tu-note">As of ' + esc(dlong(c.date)) + '.</p>';
		drawUSCharts();
	}
	function conv(v, native) { return D.convert(v, native, curOf(native), fx()); }
	function fyMoney(native) { return function (v) { return D.big(v, curOf(native), 1); }; }
	function drawUSCharts() {
		var h = src('history'), p = src('penny'), f = src('fred') || {}, cur = curOf('USD');
		var fy = function (v) { return D.sym(cur) + D.short(v); };
		if (h || p) {
			var pts;
			if (st.hr === '1y' && p) pts = p.rows.filter(function (r) { return r[0] >= D.addDays(p.latest.date, -365); }).map(function (r) { return [ms(r[0]), conv(r[1], 'USD'), dlong(r[0])]; });
			else {
				pts = (h || []).filter(function (r) { return st.hr !== '1940' || r[0] >= '1940'; }).map(function (r) { return [ms(r[0]), conv(r[1], 'USD'), dlong(r[0])]; });
				if (p && (!h || p.latest.date > h[h.length - 1][0])) pts.push([ms(p.latest.date), conv(p.latest.total, 'USD'), dlong(p.latest.date)]);
			}
			$('dc-hist-title').textContent = st.hr === '1y' ? 'US debt, last 12 months (daily)' : st.hr === '1940' ? 'US debt since 1940' : 'US debt since 1790';
			chart($('dc-hist-chart'), { series: [{ pts: pts, cls: 'dc-s1', fill: st.hs === 'lin' }], log: st.hs === 'log', fy: fy, fv: function (v) { return D.full(v, cur); }, zero: st.hr !== '1y', label: 'US total public debt' });
			$('dc-hist-note').innerHTML = st.hr === '1y' ? 'Daily Debt to the Penny. The steps are real: Treasury borrows in lumps on auction days, which is why the clock uses an average.' : 'Historical Debt Outstanding (Treasury): one value per year (January 1 until 1843, then July 1 / June 30, and September 30 since 1977, when the fiscal year changed), not adjusted for inflation. ' + (st.hs === 'log' ? 'Log scale: each grid line is 10 times the one below, so equal growth rates look like equal slopes.' : 'Linear scale: switch to Log to see the early years.');
		} else $('dc-hist-chart').innerHTML = err('history');
		if (f.ratio) chart($('dc-ratio-chart'), { series: [{ pts: f.ratio.map(function (r) { return [ms(r[0]), r[1], dmon(r[0])]; }), cls: 'dc-s2', fill: true }], fy: function (v) { return v + '%'; }, fv: function (v) { return D.pct(v); }, label: 'US debt to GDP' });
		else $('dc-ratio-chart').innerHTML = err('fred');
		var fyi = src('interestFy');
		if (fyi) chart($('dc-int-chart'), { bars: true, series: [{ pts: fyi.map(function (r) { return [ms(String(r[0])), conv(r[1], 'USD'), 'Fiscal year ' + r[0]]; }), cls: 'dc-s3' }], fy: fy, fv: fyMoney('USD'), fx: function (t) { return 'FY' + new Date(t).getUTCFullYear(); }, h: 210, label: 'Interest by fiscal year' });
		else $('dc-int-chart').innerHTML = err('interestFy');
		var ar = src('avgRate');
		if (ar) chart($('dc-rate-chart'), { series: [{ pts: ar.series.map(function (r) { return [ms(r[0]), r[1], dmon(r[0])]; }), cls: 'dc-s3' }], fy: function (v) { return v + '%'; }, fv: function (v) { return D.pct(v, 3); }, h: 210, label: 'Average interest rate' });
		else $('dc-rate-chart').innerHTML = err('avgRate');
		var mts = src('mts');
		if (mts) {
			var rows = [];
			function add(blk) { blk.months.forEach(function (m, i) { var mi = ['October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September'].indexOf(m.name); if (mi < 0 || m.deficit == null) return; var yr = mi < 3 ? blk.fy - 1 : blk.fy, mo = (mi + 9) % 12 + 1; rows.push([Date.UTC(yr, mo - 1, 15), conv(m.deficit, 'USD'), m.name + ' ' + yr]); }); }
			if (mts.prev) add(mts.prev); add(mts);
			$('dc-def-sub').textContent = 'fiscal years ' + (mts.prev ? mts.prev.fy + '–' : '') + mts.fy;
			chart($('dc-def-chart'), { bars: true, series: [{ pts: rows, cls: 'dc-s1' }], fy: fy, fv: function (v) { return (v < 0 ? 'Surplus ' : 'Deficit ') + D.big(Math.abs(v), cur, 1); }, h: 210, label: 'Deficit by month' });
		} else $('dc-def-chart').innerHTML = err('mts');
	}

	// ---------- World tab ----------
	function drawWorld() {
		var imf = src('imf'), c = CL.world;
		if (!imf) { $('dc-w-num').textContent = '–'; $('dc-w-how').innerHTML = err('imf'); $('dc-w-bars').innerHTML = ''; return; }
		if (c) {
			$('dc-w-rate').textContent = perSecText(c) + ' · ' + money(c.perMs * 864e5, 'USD', 'big') + ' a day';
			$('dc-w-how').innerHTML = 'IMF estimates of world government debt: <b>' + esc(money(c.a.viaRatio, 'USD', 'big')) + '</b> for ' + c.a.year + ' and <b>' + esc(money(c.b.viaRatio, 'USD', 'big')) + '</b> for ' + c.b.year + ' (the IMF world ratio of ' + D.pct(c.a.worldPct) + ' and ' + D.pct(c.b.worldPct) + ' of world GDP). The clock draws a straight line between the two year-end figures. Adding up the ' + c.b.n + ' countries one by one gives ' + esc(money(c.b.sum, 'USD', 'big')) + ' for ' + c.b.year + '.' + staleNote(['imf']);
			var us = CL.us ? now('us') : null, o = [];
			if (c.pop) o.push(tile('Per person on Earth', '<span id="dc-world-pp">–</span>', (c.pop / 1e9).toFixed(2) + ' billion people (IMF, ' + c.b.year + ')', 'perperson'));
			o.push(tile('Share of world GDP', D.pct(c.b.worldPct), 'IMF, ' + c.b.year, 'debtgdp'));
			var usI = D.countryTable(imf, c.b.year).find(function (r) { return r.code === 'USA'; });
			if (usI && usI.debt) o.push(tile('United States&rsquo; share', D.pct(usI.debt / c.b.viaRatio * 100), 'of world government debt (IMF, ' + c.b.year + ')'));
			o.push(tile('Added since you opened this page', '<span id="dc-world-since">$0</span>', 'at the estimated rate', 'estimate'));
			$('dc-w-tiles').innerHTML = o.join('');
		}
		var ysel = $('dc-year'), yrs = imf.years, cy = String(new Date().getUTCFullYear());
		if (!st.year || yrs.indexOf(String(st.year)) < 0) st.year = yrs.indexOf(cy) >= 0 ? cy : yrs[yrs.length - 1];
		ysel.innerHTML = yrs.map(function (y) { return '<option value="' + y + '"' + (String(st.year) === y ? ' selected' : '') + '>' + y + (y > cy ? ' (projection)' : y === cy ? ' (estimate)' : '') + '</option>'; }).join('');
		drawWorldTable();
	}
	function fmtMetric(k) { var cur = curOf('USD'); return k === 'pct' ? function (v) { return D.pct(v); } : k === 'pp' || k === 'perPerson' ? function (v) { return D.full(conv(v, 'USD'), cur); } : function (v) { return D.big(conv(v, 'USD'), cur, 1); }; }
	function drawWorldTable() {
		var imf = src('imf'); if (!imf) return;
		var tab = D.countryTable(imf, st.year), f = ($('dc-find').value || '').trim().toLowerCase(), mk = st.wm === 'pp' ? 'perPerson' : st.wm;
		var ranked = tab.filter(function (r) { return r[mk] != null; }).sort(function (a, b) { return b[mk] - a[mk]; });
		ranked.forEach(function (r, i) { r.rank = i + 1; });
		var top = ranked.slice(0, 20), extra = ranked.filter(function (r) { return (r.code === 'USA' || r.code === 'CAN') && r.rank > 20; });
		hbars($('dc-w-bars'), top.concat(extra).map(function (r) { return { name: (r.rank > 20 ? r.rank + '. ' : '') + r.name, code: r.code, v: r[mk] }; }), fmtMetric(st.wm));
		$('dc-w-bars')._redraw = null;
		var k = st.wsort, dir = st.wdir;
		var rows = tab.map(function (r) { var x = ranked.find(function (z) { return z.code === r.code; }); r.rank = x ? x.rank : null; return r; })
			.filter(function (r) { return !f || r.name.toLowerCase().indexOf(f) >= 0 || r.code.toLowerCase() === f; })
			.sort(function (a, b) { var va = a[k], vb = b[k]; if (k === 'name') return dir * (va < vb ? -1 : 1); if (va == null) return 1; if (vb == null) return -1; return dir * (va - vb); });
		$('dc-wcount').textContent = rows.length + ' of ' + tab.length + ' countries · ranked by ' + ({ pct: '% of GDP', debt: 'total debt', pp: 'debt per person' })[st.wm];
		var fd = fmtMetric('debt'), fp = fmtMetric('pp');
		$('dc-wtable').querySelector('tbody').innerHTML = rows.map(function (r) {
			return '<tr class="' + (r.code === 'USA' ? 'dc-tr--us' : r.code === 'CAN' ? 'dc-tr--ca' : '') + '"><td class="num">' + (r.rank || '') + '</td><td>' + esc(r.name) + '</td><td class="num">' + D.pct(r.pct) + '</td><td class="num">' + (r.debt != null ? esc(fd(r.debt)) : '–') + '</td><td class="num">' + (r.perPerson != null ? esc(fp(r.perPerson)) : '–') + '</td><td class="num">' + (r.gdp != null ? esc(fd(r.gdp)) : '–') + '</td></tr>';
		}).join('') || '<tr><td colspan="6">No country matches.</td></tr>';
		[].forEach.call($('dc-wtable').querySelectorAll('th'), function (th) { var on = th.getAttribute('data-k') === k; th.setAttribute('aria-sort', on ? (dir > 0 ? 'ascending' : 'descending') : 'none'); th.tabIndex = 0; });
	}
	$('dc-year').addEventListener('change', function () { st.year = this.value; save(); drawWorldTable(); });
	$('dc-find').addEventListener('input', drawWorldTable);
	function sortBy(th) { var k = th.getAttribute('data-k'); if (k === 'rank') k = st.wm === 'pp' ? 'perPerson' : st.wm; if (st.wsort === k) st.wdir = -st.wdir; else { st.wsort = k; st.wdir = k === 'name' ? 1 : -1; } save(); drawWorldTable(); }
	$('dc-wtable').querySelector('thead').addEventListener('click', function (e) { var th = e.target.closest('th'); if (th) sortBy(th); });
	$('dc-wtable').querySelector('thead').addEventListener('keydown', function (e) { var th = e.target.closest('th'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); sortBy(th); } });

	// ---------- Canada tab ----------
	function drawCA() {
		var c = CL.ca, ca = src('canada'), imf = src('imf');
		if (!c) { $('dc-ca-num').textContent = '–'; $('dc-ca-how').innerHTML = err('canada'); return; }
		$('dc-ca-rate').textContent = perSecText(c) + ' · ' + money(c.perMs * 864e5, 'CAD', 'big') + ' a day';
		$('dc-ca-how').innerHTML = 'Statistics Canada&rsquo;s last figure: <b>' + esc(money(c.base, 'CAD', 'full')) + '</b> at the end of ' + esc(dmon(c.date)) + ' (published monthly, a few months behind). Since then the page adds the average change of ' + esc(money(c.rate.perDay, 'CAD', 'big')) + ' a day from ' + esc(dmon(c.rate.from[0])) + ' to ' + esc(dmon(c.rate.to[0])) + '. Because the data lags, this estimate can be further off than the US one.' + staleNote(['canada']);
		var est = now('ca'), o = [];
		if (c.pop) o.push(tile('Per Canadian', '<span id="dc-ca-pp">–</span>', (c.pop / 1e6).toFixed(1) + ' million people (Statistics Canada, ' + esc(dmon(ca.pop[0])) + ')', 'perperson'));
		if (c.gdp) o.push(tile('Federal debt-to-GDP', D.pct(est / c.gdp * 100), 'GDP ' + esc(money(c.gdp, 'CAD', 'big')) + ' a year (' + esc(dmon(ca.gdp[0])) + ' quarter, annual rate)', 'debtgdp'));
		if (ca.gross) o.push(tile('Gross federal liabilities', esc(money(ca.gross[1], 'CAD', 'big')), 'before subtracting assets, ' + esc(dmon(ca.gross[0])), 'cafed'));
		if (imf) { var r = D.countryTable(imf, new Date().getUTCFullYear()).find(function (x) { return x.code === 'CAN'; }); if (r) o.push(tile('All governments (IMF)', D.pct(r.pct), 'general government gross debt, % of GDP, ' + new Date().getUTCFullYear() + ' estimate', 'gross')); }
		o.push(tile('Added since you opened this page', '<span id="dc-ca-since">$0</span>', 'at the estimated rate', 'estimate'));
		var fxv = src('fx'); if (fxv) o.push(tile('Exchange rate', 'US$1 = C$' + fxv.usdcad.toFixed(4), 'Bank of Canada, ' + esc(dlong(fxv.date)) + ' (used by the currency switch)'));
		$('dc-ca-tiles').innerHTML = o.join('');
		var cur = curOf('CAD');
		chart($('dc-ca-chart'), { series: [{ pts: ca.fed.map(function (r) { return [ms(r[0]), conv(r[1], 'CAD'), dmon(r[0])]; }), cls: 'dc-s2', fill: true }], zero: false, fy: function (v) { return D.sym(cur) + D.short(v); }, fv: function (v) { return D.big(v, cur); }, label: 'Canada federal debt' });
	}
	function drawTab(t) { if (t === 'us') drawUS(); else if (t === 'world') drawWorld(); else drawCA(); tick(); }

	// ---------- big clock (fills the window; Full screen on top of that) ----------
	var bv = $('dc-bv'), bvLast = null;
	function openBig(k, fs) {
		if (!CL[k]) return;
		st.big = k; save(); bv.hidden = false; document.documentElement.classList.add('dc-bv-on'); bvLast = document.activeElement; bigPick(); bigFit(); $('dc-bv-x').focus();
		if (fs && bv.requestFullscreen) bv.requestFullscreen().catch(function () {});
	}
	function closeBig() { if (document.fullscreenElement === bv && document.exitFullscreen) document.exitFullscreen().catch(function () {}); bv.hidden = true; document.documentElement.classList.remove('dc-bv-on'); if (bvLast && bvLast.focus) bvLast.focus(); }
	function bigPick() {
		[].forEach.call($('dc-bv-pick').querySelectorAll('button'), function (b) { var k = b.getAttribute('data-c'); b.setAttribute('aria-pressed', String(k === st.big)); b.disabled = !CL[k]; });
		var c = CL[st.big]; $('dc-bv-l').textContent = c.label + ' (estimate)';
		$('dc-bv-note').textContent = st.big === 'us' ? 'Treasury figure of ' + dlong(c.date) + ' + average change over ' + Math.round(c.rate.days) + ' days · mes.fm/debt-clock' : st.big === 'ca' ? 'Statistics Canada figure for ' + dmon(c.date) + ' + average change over ' + Math.round(c.rate.days / 30.44) + ' months · mes.fm/debt-clock' : 'Straight line between IMF estimates for ' + c.line.from + ' and ' + c.line.to + ' · mes.fm/debt-clock';
		$('dc-bv-fs').textContent = document.fullscreenElement === bv ? 'Exit full screen' : '⛶ Full screen';
		bigTick(Date.now()); bv._len = 0;
	}
	function bigTick(t) {
		var k = st.big, c = CL[k]; if (!c) return;
		var v = now(k, t), n = $('dc-bv-n'), s = money(v, c.cur, 'full');
		n.textContent = s; if (s.length !== bv._len) { bv._len = s.length; bigFit(); }
		var cnt = k === 'us' ? c.counts.people : c.pop;
		$('dc-bv-s').textContent = perSecText(c) + (cnt ? ' · ' + moneySmall(v / cnt, c.cur) + ' per person' : '');
		$('dc-bv-s2').textContent = 'Added since you opened this page: ' + (c.perMs >= 0 ? '+' : '') + moneySmall(c.perMs * (t - opened), c.cur);
	}
	function bigFit() { var n = $('dc-bv-n'), w = bv.clientWidth || window.innerWidth, h = bv.clientHeight || window.innerHeight; n.style.fontSize = '100px'; var sw = n.scrollWidth || 1000; n.style.fontSize = Math.max(18, Math.min(100 * w * 0.94 / sw, h * 0.32)) + 'px'; }
	$('dc-bv-pick').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && !b.disabled) { st.big = b.getAttribute('data-c'); save(); bigPick(); } });
	$('dc-bv-x').onclick = closeBig;
	$('dc-bv-fs').onclick = function () { if (document.fullscreenElement === bv) document.exitFullscreen().catch(function () {}); else if (bv.requestFullscreen) bv.requestFullscreen().catch(function () {}); };
	document.addEventListener('fullscreenchange', function () { if (!bv.hidden) { bigPick(); setTimeout(bigFit, 60); } });
	window.addEventListener('resize', function () { if (!bv.hidden) bigFit(); });
	document.addEventListener('keydown', function (e) {
		if (e.key !== 'Escape') return;
		if (!pop.hidden) { var b = popFor; closePop(); if (b) b.focus(); return; }
		if (!bv.hidden && document.fullscreenElement !== bv) closeBig();   // in real full screen the browser's own Esc leaves full screen first
	});
	bv.addEventListener('keydown', function (e) { if (e.key === 'Tab') { var f = [].slice.call(bv.querySelectorAll('button:not([disabled])')), i = f.indexOf(document.activeElement); if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } } });

	// ---------- loading ----------
	function sourceList() {
		var NAMES = { penny: 'US Treasury, Debt to the Penny (daily)', history: 'US Treasury, Historical Debt Outstanding (since 1790)', interest: 'US Treasury, Interest Expense (monthly)', interestFy: 'US Treasury, Interest Expense by fiscal year', avgRate: 'US Treasury, Average Interest Rates', mts: 'US Treasury, Monthly Treasury Statement', fred: 'FRED (St. Louis Fed): GDP, population, households, debt-to-GDP', imf: 'IMF World Economic Outlook (DataMapper)', canada: 'Statistics Canada: federal debt, population, GDP', fx: 'Bank of Canada: US dollar exchange rate' };
		$('dc-srcs').innerHTML = Object.keys(NAMES).map(function (k) { var s = data.sources[k]; return '<li><span class="dc-sd ' + (s && s.ok ? (stale[k] ? 'st' : 'ok') : 'no') + '"></span>' + esc(NAMES[k]) + ' &middot; ' + (s && s.ok ? (stale[k] ? 'saved copy' : 'live') : 'did not answer' + (s && s.error ? ': ' + esc(s.error) : '')) + '</li>'; }).join('');
		$('dc-updated').textContent = (MOCK ? 'Sample data saved ' : 'Data fetched ') + dlong(data.generated) + (MOCK ? ' (preview)' : '') + '.';
	}
	function status(msg, isErr) { var s = $('dc-status'); s.hidden = !msg; s.className = 'dc-status' + (isErr ? ' err' : ''); s.textContent = msg || ''; }
	function getSample() { return sample ? Promise.resolve(sample) : fetch('/debt-clock/data/sample.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).then(function (j) { sample = j; return j; }); }
	function load() {
		status('');
		var p = MOCK ? getSample() : fetch('/api/debt', { cache: 'no-cache' }).then(function (r) { if (!r.ok && r.status !== 502) throw new Error('HTTP ' + r.status); return r.json(); });
		p.then(function (j) {
			if (!j || !j.sources) throw new Error('bad answer');
			var bad = Object.keys(j.sources).filter(function (k) { return !j.sources[k].ok; });
			if (!bad.length || MOCK) return j;
			return getSample().then(function (s) { bad.forEach(function (k) { if (s.sources[k] && s.sources[k].ok) { j.sources[k] = s.sources[k]; stale[k] = 1; } }); return j; }).catch(function () { return j; });
		}).catch(function () {
			return getSample().then(function (s) { Object.keys(s.sources).forEach(function (k) { stale[k] = 1; }); status('Live data could not be loaded, so this shows the saved copy from ' + dlong(s.generated) + '. The ticking estimate starts from those older figures.', true); return s; });
		}).then(function (j) {
			data = j; buildClocks(); segs(); sourceList(); showTab(st.tab);
		}).catch(function () { status('The data could not be loaded. Please try again later.', true); });
	}
	$('dc-refresh').onclick = function () { stale = {}; load(); };
	segs(); load();
})();
