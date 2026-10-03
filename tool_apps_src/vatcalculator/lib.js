/* MES VAT Calculator -- pure maths + rate table (no DOM). Runs in the browser (global `VC`) and in node:
 *   const VC = require('./tool_apps_src/vatcalculator/lib.js');   tests: node tool_apps_src/vatcalculator-tests.js
 *
 * Money is never a float: every amount is an exact rational {n, d} of BigInts (so 0.1 + 0.2 is exactly 0.3 and a 9.975% rate is
 * exactly 9975/100000), and rounding to the currency's minor unit (or to a whole unit / 0.05) happens only where a tax authority
 * would round: the derived amounts, half away from zero.
 *
 * RATE TABLE: edit COUNTRIES / REGIONS below, then bump RATES_VERIFIED and run build_tool_apps.py --apply (see CLAUDE.md).
 */
(function (root) {
	"use strict";

	/* ======================================================================================= rate table */
	var RATES_VERIFIED = "2026-10-03";
	var SOURCES = [
		["European Commission: VAT rates (Taxes in Europe Database)", "https://taxation-customs.ec.europa.eu/taxation/vat/vat-directive/vat-rates_en"],
		["Tax Foundation: 2026 European VAT rates", "https://taxfoundation.org/data/all/eu/value-added-tax-vat-rates-europe/"],
		["PwC Worldwide Tax Summaries: VAT/GST rates", "https://taxsummaries.pwc.com/quick-charts/value-added-tax-vat-rates"],
		["Tax Foundation: 2026 state sales tax rates (1 July 2026)", "https://taxfoundation.org/data/all/state/2026-sales-tax-rates-midyear/"],
		["TaxTips.ca: Canadian sales tax rates 2026", "https://www.taxtips.ca/salestaxes/sales-tax-rates-2026.htm"],
		["OECD: Consumption tax trends", "https://www.oecd.org/en/topics/policy-issues/consumption-tax-trends.html"]
	];

	var GROUPS = [["eu", "European Union"], ["eur", "Other Europe"], ["am", "Americas"], ["ap", "Asia-Pacific"], ["me", "Middle East"], ["af", "Africa"]];

	function flag(code) {
		if (!/^[A-Z]{2}$/.test(code)) return "";
		return String.fromCodePoint(127397 + code.charCodeAt(0), 127397 + code.charCodeAt(1));
	}
	// [code, name, group, currency, tax name, standard rate, [[reduced rate, label], ...], note]
	var R = "Reduced";
	var RAW = [
		["AT", "Austria", "eu", "EUR", "VAT", 20, [[10, R], [13, R]]],
		["BE", "Belgium", "eu", "EUR", "VAT", 21, [[6, R], [12, R]]],
		["BG", "Bulgaria", "eu", "EUR", "VAT", 20, [[9, R]]],
		["HR", "Croatia", "eu", "EUR", "VAT", 25, [[5, R], [13, R]]],
		["CY", "Cyprus", "eu", "EUR", "VAT", 19, [[5, R], [9, R]]],
		["CZ", "Czechia", "eu", "CZK", "VAT", 21, [[12, R]]],
		["DK", "Denmark", "eu", "DKK", "VAT", 25, [], "Denmark has no reduced VAT rates."],
		["EE", "Estonia", "eu", "EUR", "VAT", 24, [[9, R], [13, R]], "Estonia raised its standard rate from 22% to 24% on 1 July 2025."],
		["FI", "Finland", "eu", "EUR", "VAT", 25.5, [[10, R], [13.5, R]], "Finland's 14% reduced rate was lowered to 13.5% in 2026."],
		["FR", "France", "eu", "EUR", "VAT", 20, [[2.1, "Super-reduced"], [5.5, R], [10, R]]],
		["DE", "Germany", "eu", "EUR", "VAT", 19, [[7, R]]],
		["GR", "Greece", "eu", "EUR", "VAT", 24, [[6, R], [13, R]]],
		["HU", "Hungary", "eu", "HUF", "VAT", 27, [[5, R], [18, R]], "Hungary has the highest standard VAT rate in the world."],
		["IE", "Ireland", "eu", "EUR", "VAT", 23, [[4.8, "Super-reduced"], [9, R], [13.5, R]]],
		["IT", "Italy", "eu", "EUR", "IVA", 22, [[4, "Super-reduced"], [5, R], [10, R]]],
		["LV", "Latvia", "eu", "EUR", "VAT", 21, [[5, R], [12, R]]],
		["LT", "Lithuania", "eu", "EUR", "VAT", 21, [[5, R], [9, R]]],
		["LU", "Luxembourg", "eu", "EUR", "VAT", 17, [[3, "Super-reduced"], [8, R]], "Luxembourg has the lowest standard VAT rate in the EU."],
		["MT", "Malta", "eu", "EUR", "VAT", 18, [[5, R], [7, R]]],
		["NL", "Netherlands", "eu", "EUR", "VAT (BTW)", 21, [[9, R]]],
		["PL", "Poland", "eu", "PLN", "VAT (PTU)", 23, [[5, R], [8, R]]],
		["PT", "Portugal", "eu", "EUR", "VAT (IVA)", 23, [[6, R], [13, R]], "Mainland rates; Madeira and the Azores use lower rates."],
		["RO", "Romania", "eu", "RON", "VAT (TVA)", 21, [[11, R]], "Romania raised its standard rate from 19% to 21% and its reduced rate from 9% to 11% on 1 August 2025."],
		["SK", "Slovakia", "eu", "EUR", "VAT (DPH)", 23, [[5, R], [19, R]], "Slovakia raised its standard rate from 20% to 23% on 1 January 2025."],
		["SI", "Slovenia", "eu", "EUR", "VAT (DDV)", 22, [[5, R], [9.5, R]]],
		["ES", "Spain", "eu", "EUR", "VAT (IVA)", 21, [[4, "Super-reduced"], [10, R]], "Mainland Spain. The Canary Islands (IGIC), Ceuta and Melilla have their own taxes."],
		["SE", "Sweden", "eu", "SEK", "VAT (moms)", 25, [[6, R], [12, R]]],
		["GB", "United Kingdom", "eu", "GBP", "VAT", 20, [[5, "Reduced (e.g. home energy)"]], "Most food, books and children's clothes are zero-rated (0%). Domestic electricity in Great Britain moves from 5% to 0% on 1 October 2026."],
		["NO", "Norway", "eur", "NOK", "VAT (MVA)", 25, [[15, "Food"], [12, "Hotels, transport, cinema"]]],
		["CH", "Switzerland", "eur", "CHF", "VAT (MWST/TVA)", 8.1, [[3.8, "Accommodation"], [2.6, "Reduced (food, books, medicine)"]], "Also applies in Liechtenstein."],
		["IS", "Iceland", "eur", "ISK", "VAT", 24, [[11, R]]],
		["TR", "Turkey", "eur", "TRY", "VAT (KDV)", 20, [[10, R], [1, "Super-reduced"]]],
		["RU", "Russia", "eur", "RUB", "VAT (NDS)", 22, [[10, "Reduced (food, medicine, children's goods)"]], "Russia raised its standard rate from 20% to 22% on 1 January 2026."],
		["UA", "Ukraine", "eur", "UAH", "VAT (PDV)", 20, [[14, R], [7, R]]],
		["MX", "Mexico", "am", "MXN", "IVA", 16, [], "Most food and medicine are 0%."],
		["BR", "Brazil", "am", "BRL", "IBS / CBS / ICMS", null, [], "Brazil has no single VAT rate: federal PIS/COFINS (3.65% or 9.25%), state ICMS (usually 17-20%) and municipal ISS (2-5%) are being replaced by the new IBS and CBS during a transition that runs to 2033. Type the combined rate that applies to your product."],
		["AR", "Argentina", "am", "ARS", "IVA", 21, [[10.5, R]]],
		["CL", "Chile", "am", "CLP", "IVA", 19, []],
		["CO", "Colombia", "am", "COP", "IVA", 19, [[5, R]]],
		["PE", "Peru", "am", "PEN", "IGV", 18, [], "16% IGV plus 2% municipal promotion tax."],
		["IN", "India", "ap", "INR", "GST", 18, [[5, "Essentials"], [40, "Luxury and sin goods"]], "Since GST 2.0 (22 September 2025) there are two main slabs, 5% and 18%, plus 40% on luxury and sin goods; the old 12% and 28% slabs are gone. GST is split into CGST + SGST (or IGST between states)."],
		["AU", "Australia", "ap", "AUD", "GST", 10, [], "Basic food, many health and education items are GST-free (0%)."],
		["NZ", "New Zealand", "ap", "NZD", "GST", 15, []],
		["SG", "Singapore", "ap", "SGD", "GST", 9, [], "Exports and international services are zero-rated."],
		["JP", "Japan", "ap", "JPY", "Consumption tax", 10, [[8, "Reduced (food and drink, newspapers)"]]],
		["KR", "South Korea", "ap", "KRW", "VAT", 10, []],
		["TH", "Thailand", "ap", "THB", "VAT", 7, [[10, "Statutory rate"]], "The statutory rate is 10%, but a reduced 7% has applied for decades; it was extended again to 30 September 2027."],
		["VN", "Vietnam", "ap", "VND", "VAT", 10, [[8, "Temporary reduced rate (to 31 Dec 2026)"], [5, R]], "A temporary 2% cut brings most supplies to 8% until 31 December 2026; telecoms, finance and a few other sectors stay at 10%."],
		["PH", "Philippines", "ap", "PHP", "VAT", 12, []],
		["MY", "Malaysia", "ap", "MYR", "Sales and service tax", 10, [[5, "Sales tax (lower band)"], [8, "Service tax (most services)"], [6, "Service tax (food and drink, telecoms, parking, logistics ...)"]], "Malaysia has a single-stage sales tax (5% or 10%) and service tax (6% or 8%), not a VAT."],
		["ID", "Indonesia", "ap", "IDR", "VAT (PPN)", 11, [[12, "Luxury goods"]], "The statutory rate is 12% (since 1 January 2025) but it is charged on 11/12 of the price for most goods and services, so the effective rate is 11%."],
		["CN", "China", "ap", "CNY", "VAT", 13, [[9, R], [6, R]]],
		["AE", "United Arab Emirates", "me", "AED", "VAT", 5, []],
		["SA", "Saudi Arabia", "me", "SAR", "VAT", 15, []],
		["IL", "Israel", "me", "ILS", "VAT", 18, []],
		["EG", "Egypt", "me", "EGP", "VAT", 14, [[5, R]]],
		["ZA", "South Africa", "af", "ZAR", "VAT", 15, [], "Basic foods are zero-rated (0%)."],
		["NG", "Nigeria", "af", "NGN", "VAT", 7.5, []],
		["KE", "Kenya", "af", "KES", "VAT", 16, [[8, R]]]
	];
	var COUNTRIES = RAW.map(function (r) {
		return { code: r[0], name: r[1], group: r[2], cur: r[3], tax: r[4], std: r[5], red: r[6], note: r[7] || "", flag: flag(r[0]) };
	});
	// countries with sub-national rates: [code, name, rate, note, reduced chips]
	var CA_ROWS = [
		["AB", "Alberta", 5, "5% GST"], ["BC", "British Columbia", 12, "5% GST + 7% PST"], ["MB", "Manitoba", 12, "5% GST + 7% RST"],
		["NB", "New Brunswick", 15, "15% HST"], ["NL", "Newfoundland and Labrador", 15, "15% HST"], ["NS", "Nova Scotia", 14, "14% HST (cut from 15% on 1 April 2025)"],
		["NT", "Northwest Territories", 5, "5% GST"], ["NU", "Nunavut", 5, "5% GST"], ["ON", "Ontario", 13, "13% HST"],
		["PE", "Prince Edward Island", 15, "15% HST"], ["QC", "Quebec", 14.975, "5% GST + 9.975% QST"], ["SK", "Saskatchewan", 11, "5% GST + 6% PST"],
		["YT", "Yukon", 5, "5% GST"]
	];
	var US_ROWS = [
		["AL", "Alabama", 4], ["AK", "Alaska", 0], ["AZ", "Arizona", 5.6], ["AR", "Arkansas", 6.5], ["CA", "California", 7.25], ["CO", "Colorado", 2.9],
		["CT", "Connecticut", 6.35], ["DE", "Delaware", 0], ["DC", "District of Columbia", 6], ["FL", "Florida", 6], ["GA", "Georgia", 4], ["HI", "Hawaii", 4],
		["ID", "Idaho", 6], ["IL", "Illinois", 6.25], ["IN", "Indiana", 7], ["IA", "Iowa", 6], ["KS", "Kansas", 6.5], ["KY", "Kentucky", 6], ["LA", "Louisiana", 5],
		["ME", "Maine", 5.5], ["MD", "Maryland", 6], ["MA", "Massachusetts", 6.25], ["MI", "Michigan", 6], ["MN", "Minnesota", 6.88], ["MS", "Mississippi", 7],
		["MO", "Missouri", 4.23], ["MT", "Montana", 0], ["NE", "Nebraska", 5.5], ["NV", "Nevada", 6.85], ["NH", "New Hampshire", 0], ["NJ", "New Jersey", 6.63],
		["NM", "New Mexico", 4.88], ["NY", "New York", 4], ["NC", "North Carolina", 4.75], ["ND", "North Dakota", 5], ["OH", "Ohio", 5.75], ["OK", "Oklahoma", 4.5],
		["OR", "Oregon", 0], ["PA", "Pennsylvania", 6], ["RI", "Rhode Island", 7], ["SC", "South Carolina", 6], ["SD", "South Dakota", 4.2], ["TN", "Tennessee", 7],
		["TX", "Texas", 6.25], ["UT", "Utah", 6.1], ["VT", "Vermont", 6], ["VA", "Virginia", 5.3], ["WA", "Washington", 6.5], ["WV", "West Virginia", 6],
		["WI", "Wisconsin", 5], ["WY", "Wyoming", 4]
	];
	COUNTRIES.push({
		code: "CA", name: "Canada", group: "am", cur: "CAD", tax: "GST / HST / PST", std: null, red: [], flag: flag("CA"), regionLabel: "Province or territory",
		note: "Pick your province: the combined rate is what you pay. Items that are exempt from the provincial tax still carry the 5% federal GST.",
		regions: CA_ROWS.map(function (r) { return { code: r[0], name: r[1], rate: r[2], note: r[3], red: r[2] !== 5 ? [[5, "Federal GST only"]] : [] }; })
	});
	COUNTRIES.push({
		code: "US", name: "United States", group: "am", cur: "USD", tax: "Sales tax", std: null, red: [], flag: flag("US"), regionLabel: "State",
		note: "The US has no VAT. Sales tax is charged at the register: a state base rate plus city / county / district taxes that differ from place to place. The state base rate is shown; type your full local rate if you know it. Alaska, Delaware, Montana, New Hampshire and Oregon have no state sales tax (Alaska allows local taxes).",
		regions: US_ROWS.map(function (r) { return { code: r[0], name: r[1], rate: r[2], note: r[2] ? r[2] + "% state base rate (local taxes extra)" : "No state sales tax", red: [] }; })
	});
	COUNTRIES.sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });

	function country(code) {
		for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].code === code) return COUNTRIES[i];
		return null;
	}
	function region(c, code) {
		if (!c || !c.regions) return null;
		for (var i = 0; i < c.regions.length; i++) if (c.regions[i].code === code) return c.regions[i];
		return null;
	}
	// the rate chips for a country (and region): [{r, label}] standard first; the generic 0% chip is added by the UI
	function chipsFor(c, reg) {
		if (!c) return [];
		var out = [], tax = c.tax.replace(/ \(.*/, "");
		if (c.regions) {
			if (!reg) return [];
			out.push({ r: reg.rate, label: reg.rate === 0 ? "No state tax" : "Combined" });
			reg.red.forEach(function (x) { out.push({ r: x[0], label: x[1] }); });
			return out;
		}
		if (c.std != null) out.push({ r: c.std, label: c.red.length || c.note ? "Standard" : "Standard " + tax });
		c.red.forEach(function (x) { out.push({ r: x[0], label: x[1] }); });
		return out;
	}
	function defaultRate(c, reg) {
		if (!c) return null;
		if (c.regions) return reg ? reg.rate : null;
		return c.std;
	}

	/* ======================================================================================= exact rationals */
	var ZERO = BigInt(0), ONE = BigInt(1), TEN = BigInt(10), TWO = BigInt(2);
	function babs(x) { return x < ZERO ? -x : x; }
	function gcd(a, b) { a = babs(a); b = babs(b); while (b) { var t = a % b; a = b; b = t; } return a; }
	function Q(n, d) {
		n = BigInt(n); d = d === undefined ? ONE : BigInt(d);
		if (d === ZERO) throw new Error("division by zero");
		if (d < ZERO) { n = -n; d = -d; }
		var g = gcd(n, d);
		return g > ONE ? { n: n / g, d: d / g } : { n: n, d: d };
	}
	function add(a, b) { return Q(a.n * b.d + b.n * a.d, a.d * b.d); }
	function sub(a, b) { return Q(a.n * b.d - b.n * a.d, a.d * b.d); }
	function mul(a, b) { return Q(a.n * b.n, a.d * b.d); }
	function div(a, b) { return Q(a.n * b.d, a.d * b.n); }
	function neg(a) { return { n: -a.n, d: a.d }; }
	function isZero(a) { return a.n === ZERO; }
	function cmp(a, b) { var x = a.n * b.d, y = b.n * a.d; return x < y ? -1 : x > y ? 1 : 0; }
	function eq(a, b) { return a.n === b.n && a.d === b.d; }
	// integer division rounded half away from zero
	function roundDiv(n, d) {
		var neg_ = n < ZERO; if (neg_) n = -n;
		var q = n / d, r = n % d;
		if (r * TWO >= d) q += ONE;
		return neg_ ? -q : q;
	}
	// round rational `a` to the nearest multiple of `step` (a rational > 0), half away from zero
	function roundTo(a, step) {
		var k = roundDiv(a.n * step.d, a.d * step.n);
		return Q(k * step.n, step.d);
	}
	function toNumber(a) { return Number(a.n) / Number(a.d); }

	/* ======================================================================================= parsing numbers */
	// Locale-agnostic number parse -> rational, or null. Accepts "1,234.56", "1.234,56", "1 234,56", "1'234.56", "$1,234", "1234", ".5", "12,5%".
	// Rules: if both . and , occur, the LAST one is the decimal mark; a lone separator that occurs more than once is a thousands mark;
	// a lone "." is a decimal point; a lone "," followed by exactly three digits (and not "0,xxx") is a thousands mark, else a decimal comma.
	function parse(str) {
		if (str == null) return null;
		var s = String(str).trim().replace(/[\s  '’_]/g, "").replace(/[^\d.,+\-−]/g, "").replace(/−/g, "-");
		if (!s) return null;
		var sign = ONE;
		if (s[0] === "-") { sign = -ONE; s = s.slice(1); } else if (s[0] === "+") s = s.slice(1);
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
		return Q(sign * BigInt((ip || "0") + fp), TEN ** BigInt(fp.length));
	}
	// a rate typed in percent -> a fraction (20 -> 1/5)
	function rateFrom(str) {
		var p = typeof str === "number" ? parse(String(str)) : parse(str);
		return p ? div(p, Q(100)) : null;
	}
	function rateOfNumber(x) { return rateFrom(String(x)); }

	/* ======================================================================================= rounding modes + the three-way calculation */
	var ROUNDING = [
		["cent", "Nearest cent (2 decimals)"],
		["none", "No rounding (exact)"],
		["unit", "Whole currency units"],
		["nickel", "Nearest 0.05 (cash rounding)"]
	];
	// the rounding step as a rational, for a currency with `dec` minor-unit digits
	function stepFor(mode, dec) {
		if (mode === "none") return null;
		if (mode === "unit") return Q(1);
		if (mode === "nickel") return dec >= 2 ? Q(5, 100) : Q(1);
		return Q(1, TEN ** BigInt(dec));
	}
	function rnd(a, step) { return step ? roundTo(a, step) : a; }

	// mode: "net" (add VAT), "gross" (remove VAT), "vat" (back out from the VAT amount); `v` = the amount known; `rate` a fraction (0.2).
	// Returns {net, vat, gross} as exact rationals, rounded per `step`. Returns null when it can't be solved (VAT amount at a 0% rate).
	function calc(mode, v, rate, step) {
		var net, vat, gross;
		if (mode === "net") { net = v; vat = rnd(mul(net, rate), step); gross = add(net, vat); }
		else if (mode === "gross") { gross = v; net = rnd(div(gross, add(Q(1), rate)), step); vat = sub(gross, net); }
		else if (mode === "vat") {
			if (isZero(rate)) return null;
			vat = v; net = rnd(div(vat, rate), step); gross = add(net, vat);
		} else return null;
		return { net: net, vat: vat, gross: gross };
	}
	// "find the rate" from a net and a gross amount: a fraction, or null
	function rateFromAmounts(net, gross) {
		if (isZero(net) || net.n < ZERO) return null;
		return sub(div(gross, net), Q(1));
	}

	/* ======================================================================================= itemised invoice */
	// lines: [{amt: rational (quantity x unit price), t: "net"|"gross", rate: fraction}]; how: "rate" (VAT rounded once per rate, the invoice way)
	// or "line" (each line rounded on its own). Returns {groups:[{rate, net, vat, gross, lines}], total:{net,vat,gross}, perLine:[{net,vat,gross}]}.
	function invoice(lines, how, step) {
		var perLine = lines.map(function (l) { return calc(l.t === "gross" ? "gross" : "net", l.amt, l.rate, step); });
		var groups = {}, order = [];
		lines.forEach(function (l, i) {
			var key = l.rate.n + "/" + l.rate.d;
			if (!groups[key]) { groups[key] = { rate: l.rate, N: Q(0), G: Q(0), lines: 0, net: Q(0), vat: Q(0), gross: Q(0) }; order.push(key); }
			var g = groups[key];
			g.lines++;
			if (l.t === "gross") g.G = add(g.G, l.amt); else g.N = add(g.N, l.amt);
			if (how === "line") { g.net = add(g.net, perLine[i].net); g.vat = add(g.vat, perLine[i].vat); g.gross = add(g.gross, perLine[i].gross); }
		});
		var out = order.map(function (k) {
			var g = groups[k];
			if (how !== "line") {
				// net-priced lines: VAT on their sum; gross-priced lines: net = sum / (1 + rate), VAT is the rest
				var a = calc("net", g.N, g.rate, step), b = calc("gross", g.G, g.rate, step);
				g.net = add(a.net, b.net); g.vat = add(a.vat, b.vat); g.gross = add(a.gross, b.gross);
			}
			return g;
		});
		out.sort(function (x, y) { return cmp(y.rate, x.rate); });
		var total = { net: Q(0), vat: Q(0), gross: Q(0) };
		out.forEach(function (g) { total.net = add(total.net, g.net); total.vat = add(total.vat, g.vat); total.gross = add(total.gross, g.gross); });
		return { groups: out, total: total, perLine: perLine };
	}

	/* ======================================================================================= formatting */
	// exact fixed-point string of a rational with `dp` decimals (half away from zero): "1234.50", "-0.07"
	function fixed(a, dp) {
		var scaled = roundDiv(a.n * (TEN ** BigInt(dp)), a.d), neg_ = scaled < ZERO;
		var s = (neg_ ? -scaled : scaled).toString();
		if (dp > 0) { while (s.length <= dp) s = "0" + s; s = s.slice(0, s.length - dp) + "." + s.slice(s.length - dp); }
		return (neg_ && /[1-9]/.test(s) ? "-" : "") + s;
	}
	// up to `max` decimals, at least `min`, trailing zeros trimmed down to `min`
	function trimmed(a, min, max) {
		var s = fixed(a, max);
		if (max > min && s.indexOf(".") >= 0) { var cut = s.length; while (cut > s.indexOf(".") + 1 + min && s[cut - 1] === "0") cut--; s = s.slice(0, cut); if (s[s.length - 1] === ".") s = s.slice(0, -1); }
		return s;
	}
	function currencyDigits(cur) {
		try { return new Intl.NumberFormat("en-US", { style: "currency", currency: cur }).resolvedOptions().maximumFractionDigits; } catch (e) { return 2; }
	}
	// a formatter (rational -> display string) for a locale, a currency ("" = plain number) and a rounding mode
	function formatter(loc, cur, mode) {
		var dec = cur ? currencyDigits(cur) : 2, tpl = null, grp = null, decChar = ".";
		try {
			grp = new Intl.NumberFormat(loc || "en-US", { useGrouping: true, maximumFractionDigits: 0 });
			var dp = new Intl.NumberFormat(loc || "en-US", { minimumFractionDigits: 1 }).formatToParts(1.5);
			for (var i = 0; i < dp.length; i++) if (dp[i].type === "decimal") decChar = dp[i].value;
			tpl = cur ? new Intl.NumberFormat(loc || "en-US", { style: "currency", currency: cur, currencyDisplay: "narrowSymbol" }).formatToParts(1234.5)
				: new Intl.NumberFormat(loc || "en-US", { minimumFractionDigits: 2 }).formatToParts(1234.5);
		} catch (e) { tpl = null; }
		function fmt(a, forceDp) {
			var showDp = forceDp != null ? forceDp : (mode === "none" ? Math.max(dec, 4) : mode === "unit" ? 0 : dec);
			var s = mode === "none" && forceDp == null ? trimmed(a, dec, 4) : fixed(a, showDp);
			var neg_ = s[0] === "-"; if (neg_) s = s.slice(1);
			var ip = s.split(".")[0], fp = s.split(".")[1] || "";
			var intStr = grp ? grp.format(BigInt(ip)) : ip.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
			var out = "";
			if (!tpl) out = (cur ? cur + " " : "") + intStr + (fp ? "." + fp : "");
			else {
				var done = false, placedDec = false;
				tpl.forEach(function (p) {
					if (p.type === "integer" || p.type === "group") { if (!done) { out += intStr; done = true; if (fp && !hasDecimal(tpl)) { out += decChar + fp; placedDec = true; } } }
					else if (p.type === "decimal") { if (fp) { out += decChar; } }
					else if (p.type === "fraction") { out += fp; }
					else out += p.value;
				});
				void placedDec;
			}
			return (neg_ ? "−" : "") + out;
		}
		return fmt;
	}
	function hasDecimal(tpl) { for (var i = 0; i < tpl.length; i++) if (tpl[i].type === "decimal") return true; return false; }

	var api = {
		RATES_VERIFIED: RATES_VERIFIED, SOURCES: SOURCES, GROUPS: GROUPS, COUNTRIES: COUNTRIES, country: country, region: region, chipsFor: chipsFor, defaultRate: defaultRate,
		Q: Q, add: add, sub: sub, mul: mul, div: div, neg: neg, cmp: cmp, eq: eq, isZero: isZero, toNumber: toNumber, roundTo: roundTo,
		parse: parse, rateFrom: rateFrom, ROUNDING: ROUNDING, stepFor: stepFor, calc: calc, rateFromAmounts: rateFromAmounts, invoice: invoice,
		fixed: fixed, trimmed: trimmed, currencyDigits: currencyDigits, formatter: formatter
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	else root.VC = api;
})(typeof window !== "undefined" ? window : this);
