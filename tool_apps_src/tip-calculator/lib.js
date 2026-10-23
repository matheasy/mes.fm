/* MES Tip Calculator -- pure money maths (global TP; also require()-able in node).
 * Every amount is an integer number of minor units ("cents"; for a currency with no decimals, whole units).
 * Percentages are kept as integer thousandths of a percent (17.5% = 17500) so tips are exact.
 * Tests: node tool_apps_src/tip-calculator-tests.js
 */
(function (G) {
	"use strict";
	var TP = {};

	/* ---------- currencies: symbol, decimals, rounding steps (in minor units) ---------- */
	TP.CURRENCIES = [
		["USD", "$", 2], ["CAD", "$", 2], ["EUR", "€", 2], ["GBP", "£", 2], ["AUD", "$", 2], ["NZD", "$", 2],
		["JPY", "¥", 0], ["CNY", "¥", 2], ["MXN", "$", 2], ["VND", "₫", 0], ["INR", "₹", 2], ["KRW", "₩", 0],
		["CHF", "CHF", 2], ["BRL", "R$", 2], ["ZAR", "R", 2], ["SGD", "$", 2], ["HKD", "$", 2], ["THB", "฿", 2],
		["PHP", "₱", 2], ["AED", "AED", 2], ["SEK", "kr", 2], ["NOK", "kr", 2], ["DKK", "kr", 2], ["PLN", "zł", 2],
		["TRY", "₺", 2], ["IDR", "Rp", 0], ["NONE", "", 2]
	].map(function (r) { return { code: r[0], sym: r[1], dec: r[2] }; });
	TP.cur = function (code) { for (var i = 0; i < TP.CURRENCIES.length; i++) if (TP.CURRENCIES[i].code === code) return TP.CURRENCIES[i]; return TP.CURRENCIES[0]; };
	/* rounding steps offered for a currency: [minor units, label] */
	TP.steps = function (c) {
		if (c.dec === 2) return [[100, "1"], [50, "0.50"], [25, "0.25"]];
		if (c.code === "VND" || c.code === "IDR") return [[10000, "10,000"], [5000, "5,000"], [1000, "1,000"]];
		return [[1000, "1,000"], [100, "100"], [10, "10"]];
	};
	var REGION_CUR = { US: "USD", CA: "CAD", GB: "GBP", IE: "EUR", FR: "EUR", DE: "EUR", IT: "EUR", ES: "EUR", PT: "EUR", NL: "EUR", BE: "EUR", AT: "EUR", FI: "EUR", GR: "EUR",
		AU: "AUD", NZ: "NZD", JP: "JPY", CN: "CNY", MX: "MXN", VN: "VND", IN: "INR", KR: "KRW", CH: "CHF", BR: "BRL", ZA: "ZAR", SG: "SGD", HK: "HKD", TH: "THB",
		PH: "PHP", AE: "AED", SE: "SEK", NO: "NOK", DK: "DKK", PL: "PLN", TR: "TRY", ID: "IDR" };
	TP.regionOf = function (locale) { var m = /[-_]([A-Za-z]{2})\b/.exec(String(locale || "")); return m ? m[1].toUpperCase() : ""; };
	TP.curForLocale = function (locale) { return REGION_CUR[TP.regionOf(locale)] || "USD"; };

	/* ---------- parsing ---------- */
	/* "1,234.56", "1.234,56", "12,5", "$45", "1 200" -> minor units (integer), or null. dec = decimals of the currency */
	TP.parseMoney = function (s, dec) {
		if (dec == null) dec = 2;
		s = String(s == null ? "" : s).replace(/[\s  ']/g, "").replace(/[^\d.,\-]/g, "");
		if (!s || s === "-" || /-/.test(s.slice(1))) return null;
		var neg = s[0] === "-"; if (neg) s = s.slice(1);
		var lastDot = s.lastIndexOf("."), lastCom = s.lastIndexOf(","), intPart, frac = "";
		if (lastDot >= 0 && lastCom >= 0) {
			var d = Math.max(lastDot, lastCom); intPart = s.slice(0, d).replace(/[.,]/g, ""); frac = s.slice(d + 1);
		} else if (lastDot >= 0 || lastCom >= 0) {
			var sep = lastDot >= 0 ? "." : ",", parts = s.split(sep);
			/* "1,234" / "1.234" / "1,234,567" = thousands; "12,5" / "12.50" = decimals */
			var grouped = parts.length > 2 || (parts[parts.length - 1].length === 3 && /^[1-9]\d{0,2}$/.test(parts[0]));
			if (grouped) intPart = parts.join("");
			else { intPart = parts.slice(0, -1).join(""); frac = parts[parts.length - 1]; }
		} else intPart = s;
		if (!/^\d*$/.test(intPart) || !/^\d*$/.test(frac) || (intPart + frac) === "") return null;
		var scale = Math.pow(10, dec), v = Number(intPart || "0") * scale;
		if (dec > 0) { var f = (frac + "000000").slice(0, dec + 1); v += Math.floor((Number(f) + 5) / 10); }
		else if (frac && Number(frac[0]) >= 5) v += 1;
		if (!isFinite(v) || v > 1e13) return null;
		return neg ? -v : v;
	};
	/* "18", "17.5", "17,5%" -> thousandths of a percent (integer) or null */
	TP.parsePct = function (s) {
		s = String(s == null ? "" : s).replace(/[\s%]/g, "").replace(",", ".");
		if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
		var v = Math.round(Number(s) * 1000);
		return isFinite(v) && v <= 1000000 ? v : null;
	};
	TP.parseInt = function (s) { var n = parseInt(String(s || "").replace(/\D/g, ""), 10); return isFinite(n) ? n : null; };

	/* ---------- formatting ---------- */
	function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
	TP.fmt = function (v, c, plain) {
		c = c || TP.CURRENCIES[0];
		var neg = v < 0; v = Math.abs(v);
		var s;
		if (c.dec === 0) s = group(v);
		else { var sc = Math.pow(10, c.dec); s = group(Math.floor(v / sc)) + "." + String(v % sc + sc).slice(1); }
		if (plain) return (neg ? "-" : "") + s;
		var sym = c.sym, after = /^[A-Za-z]/.test(sym) || sym === "₫" || sym === "kr" || sym === "zł";
		return (neg ? "−" : "") + (sym ? (after ? s + " " + sym : sym + s) : s);
	};
	TP.fmtPct = function (pm, dp) {
		if (pm == null || !isFinite(pm)) return "–";
		dp = dp == null ? 1 : dp;
		var v = pm / 1000, s = v.toFixed(dp);
		if (dp > 0) s = s.replace(/\.?0+$/, "");
		return s + "%";
	};

	/* ---------- core maths ---------- */
	/* round a non-negative product a * pm / 100000 half up, exact */
	TP.pctOf = function (base, pm) { if (base <= 0 || pm <= 0) return 0; return Math.floor((base * pm + 50000) / 100000); };
	TP.ceilTo = function (v, step) { return step > 1 ? Math.ceil(v / step) * step : v; };
	/* tax that is already inside a total: total * p / (100 + p) */
	TP.taxIncluded = function (total, pm) { if (total <= 0 || pm <= 0) return 0; return Math.floor((total * pm * 2 + (100000 + pm)) / ((100000 + pm) * 2)); };

	/* split `total` into n shares that add up exactly; the first (total mod n) shares get one extra cent */
	TP.splitEven = function (total, n) {
		n = Math.max(1, n | 0);
		var base = Math.floor(total / n), r = total - base * n, out = [];
		for (var i = 0; i < n; i++) out.push(base + (i < r ? 1 : 0));
		return out;
	};
	/* split `total` in proportion to integer weights (largest remainder; ties go to the earlier entry, or start at `offset`) */
	TP.allocate = function (total, weights, offset) {
		var n = weights.length, W = 0, i;
		for (i = 0; i < n; i++) W += Math.max(0, weights[i]);
		if (!n) return [];
		if (W <= 0) return TP.splitEven(total, n);
		var out = [], rem = [], used = 0;
		for (i = 0; i < n; i++) { var w = Math.max(0, weights[i]), q = total * w; out.push(Math.floor(q / W)); rem.push(q - out[i] * W); used += out[i]; }
		var left = total - used, order = [];
		offset = offset || 0;
		for (i = 0; i < n; i++) order.push(i);
		order.sort(function (a, b) { return rem[b] - rem[a] || ((a - offset + n) % n) - ((b - offset + n) % n); });
		for (i = 0; i < left; i++) out[order[i % n]] += 1;
		return out;
	};

	/* Even split.
	 * o = { bill, tipMode: "pct"|"amt", tipPct (thousandths), tipAmt, preTax: bool, taxMode: "amt"|"pct", tax (minor), taxPct (thousandths),
	 *       people, round: "none"|"total"|"person", step (minor units) }
	 * The bill is the receipt total (tax included). With preTax the tip is worked out on bill - tax. */
	TP.even = function (o) {
		var bill = Math.max(0, o.bill | 0), people = Math.max(1, Math.min(100, o.people | 0 || 1));
		var tax = 0;
		if (o.preTax) tax = o.taxMode === "pct" ? TP.taxIncluded(bill, o.taxPct || 0) : Math.max(0, Math.min(bill, o.tax | 0));
		var base = bill - tax;
		var tip = o.tipMode === "amt" ? Math.max(0, o.tipAmt | 0) : TP.pctOf(base, o.tipPct || 0);
		var total = bill + tip, step = o.step || 100, shares, rounded = false, perPerson;
		if (o.round === "total") {
			var t2 = TP.ceilTo(total, step); rounded = t2 !== total; total = t2; tip = total - bill;
			shares = TP.splitEven(total, people);
		} else if (o.round === "person") {
			perPerson = TP.ceilTo(Math.ceil(total / people), step);
			rounded = perPerson * people !== total; total = perPerson * people; tip = total - bill;
			shares = TP.splitEven(total, people);
		} else shares = TP.splitEven(total, people);
		var uneven = shares[0] !== shares[shares.length - 1];
		return {
			bill: bill, tax: tax, base: base, tip: tip, total: total, people: people, shares: shares,
			perPerson: shares[shares.length - 1], perPersonMax: shares[0], extraCents: uneven ? shares.filter(function (s) { return s === shares[0]; }).length : 0,
			uneven: uneven, rounded: rounded, effPct: base > 0 ? Math.round(tip * 100000 / base) : null,
			tipEach: TP.splitEven(tip, people)
		};
	};

	/* Uneven split.
	 * o = { people: [{name, items: [minor...]}], shared: [{name, amount, who: [person index...] (empty = everyone)}],
	 *       taxMode: "amt"|"pct", tax, taxPct (thousandths, on the items), tipMode, tipPct, tipAmt, tipOnTax: bool, round: "none"|"person", step }
	 * Item prices are before tax. Tax and tip are shared in proportion to what each person had. */
	TP.uneven = function (o) {
		var P = o.people || [], n = P.length, i, j;
		var own = P.map(function (p) { return (p.items || []).reduce(function (a, b) { return a + Math.max(0, b | 0); }, 0); });
		var sub = own.slice(), sharedTotal = 0, sharedParts = [];
		(o.shared || []).forEach(function (s, k) {
			var amt = Math.max(0, s.amount | 0), who = (s.who && s.who.length ? s.who : P.map(function (_, x) { return x; })).filter(function (x) { return x >= 0 && x < n; });
			if (!who.length || !amt) { sharedParts.push([]); return; }
			var parts = TP.allocate(amt, who.map(function () { return 1; }), k % who.length);
			var row = [];
			for (j = 0; j < who.length; j++) { sub[who[j]] += parts[j]; row.push([who[j], parts[j]]); }
			sharedParts.push(row); sharedTotal += amt;
		});
		var subtotal = sub.reduce(function (a, b) { return a + b; }, 0);
		var tax = o.taxMode === "pct" ? TP.pctOf(subtotal, o.taxPct || 0) : Math.max(0, o.tax | 0);
		var base = o.tipOnTax ? subtotal + tax : subtotal;
		var tip = o.tipMode === "amt" ? Math.max(0, o.tipAmt | 0) : TP.pctOf(base, o.tipPct || 0);
		var taxP = TP.allocate(tax, sub), tipP = TP.allocate(tip, sub);
		var rows = [];
		for (i = 0; i < n; i++) rows.push({ name: P[i].name, own: own[i], sub: sub[i], tax: taxP[i], tip: tipP[i], pay: sub[i] + taxP[i] + tipP[i] });
		var rounded = false;
		if (o.round === "person" && (o.step || 0) > 1) {
			rows.forEach(function (r) { var p2 = TP.ceilTo(r.pay, o.step); if (p2 !== r.pay) { rounded = true; r.tip += p2 - r.pay; r.pay = p2; } });
			tip = rows.reduce(function (a, r) { return a + r.tip; }, 0);
		}
		var total = subtotal + tax + tip;
		return { rows: rows, subtotal: subtotal, sharedTotal: sharedTotal, sharedParts: sharedParts, tax: tax, base: base, tip: tip, total: total, rounded: rounded,
			effPct: base > 0 ? Math.round(tip * 100000 / base) : null };
	};

	/* quick table of tips for a base */
	TP.table = function (bill, base, people, pcts) {
		return (pcts || [10, 12, 15, 18, 20, 22, 25]).map(function (p) {
			var tip = TP.pctOf(base, p * 1000), total = bill + tip;
			return { pct: p, tip: tip, total: total, each: Math.ceil(total / Math.max(1, people)) };
		});
	};

	/* ---------- tipping customs (general guidance; it varies by city, venue and service) ---------- */
	TP.COUNTRIES = [
		{ c: "US", name: "United States", pct: 20, rest: "18-22% at sit-down restaurants (15% for basic service)", notes: "Servers are often paid a low tipped wage, so the tip is a big part of their pay. Bars: $1-2 a drink or 15-20% of the tab. Taxis and rideshare 15-20%. Delivery 15-20%, at least a few dollars. Hairdressers 15-20%. Hotel housekeeping $2-5 a night. Check for an automatic gratuity on large groups so you do not tip twice." },
		{ c: "CA", name: "Canada", pct: 18, rest: "15-20% at sit-down restaurants", notes: "Much like the US. Card machines usually suggest 15/18/20% of the total after tax; many people tip on the amount before tax (GST/HST/PST), which this calculator can do. Taxis 10-15%, bars $1-2 a drink, hairdressers 15-20%." },
		{ c: "GB", name: "United Kingdom", pct: 12.5, rest: "10-12.5% if no service charge is on the bill", notes: "Many restaurants add a discretionary 12.5% service charge: if it is there, you do not need to add more, and you can ask for it to be removed if service was poor. Since October 2024 the law says tips and service charges must be passed to staff in full. No tip when you order at a pub bar. Taxis: round up or about 10%." },
		{ c: "IE", name: "Ireland", pct: 12.5, rest: "10-15% at restaurants with table service", notes: "Check for a service charge on the bill (common for groups). No tip expected at the bar in a pub. Taxis: round up. Hotel porters a euro or two a bag." },
		{ c: "AU", name: "Australia", pct: 10, rest: "Not expected; about 10% for great service at a nicer restaurant", notes: "Staff earn a full minimum wage, so tipping is optional. Rounding up a taxi fare or leaving the change is common. A weekend or public-holiday surcharge on the bill is not a tip." },
		{ c: "NZ", name: "New Zealand", pct: 10, rest: "Not expected; up to 10% for excellent service", notes: "Tipping is optional and modest. Round up taxi fares if you like. No tip at bars or cafés is normal." },
		{ c: "FR", name: "France", pct: 5, rest: "Service is included (\"service compris\"); leave a few euros or up to 5-10% for very good service", notes: "French law includes the service charge in menu prices. Leaving small change or rounding up is a kind gesture, not an obligation. Taxis: round up. Hotel porters 1-2 € a bag." },
		{ c: "DE", name: "Germany", pct: 10, rest: "Round up or 5-10%", notes: "Tell the server the total you want to pay when you hand over the money (\"make it 30\"), rather than leaving coins on the table. Taxis: round up or about 10%. Hairdressers a few euros." },
		{ c: "IT", name: "Italy", pct: 5, rest: "Not expected; round up or leave a few euros", notes: "A cover charge (\"coperto\") and sometimes a service charge (\"servizio\") already appear on the bill. Tipping on top is optional. At a café bar, a few coins is plenty." },
		{ c: "ES", name: "Spain", pct: 5, rest: "Not expected; small change or 5-10% at nicer restaurants", notes: "Service is part of the price. Rounding up or leaving coins is common for good service; tipping taxi drivers is optional." },
		{ c: "JP", name: "Japan", pct: 0, rest: "No tipping", notes: "Tips are not expected and can cause confusion; staff may run after you to return the money. Higher-end hotels and restaurants may add a 10-15% service charge. A traditional inn (ryokan) or a private guide may accept a tip in an envelope, but it is still optional." },
		{ c: "CN", name: "China (mainland)", pct: 0, rest: "Generally not expected", notes: "Most restaurants and taxis do not expect a tip. Upscale hotels and restaurants often add a 10-15% service charge. Tour guides and drivers on tours commonly receive tips." },
		{ c: "MX", name: "Mexico", pct: 15, rest: "10-15% at restaurants (15-20% at upscale or tourist places)", notes: "Check whether the bill already says \"propina incluida\" (tip included). Taxis are not usually tipped, but rounding up is welcome. Small tips are common for gas station attendants, grocery baggers and hotel housekeeping." },
		{ c: "VN", name: "Vietnam", pct: 5, rest: "Not traditional; rounding up or 5-10% is appreciated in tourist areas", notes: "Local restaurants do not expect tips. Hotels and upscale places may add a service charge (often 5%). Tips are customary for tour guides, drivers on tours and spa or massage staff." },
		{ c: "IN", name: "India", pct: 10, rest: "About 10% if no service charge is on the bill", notes: "Under India's 2022 consumer guidelines, a restaurant service charge is voluntary and must not be added by default: you can ask for it to be removed. Small tips are usual for delivery riders, hotel staff and drivers." },
		{ c: "KR", name: "South Korea", pct: 0, rest: "Not expected", notes: "Tipping is not part of the culture. Luxury hotels may add a service charge. Tour guides sometimes receive tips." },
		{ c: "BR", name: "Brazil", pct: 10, rest: "A 10% \"serviço\" is usually added to the bill", notes: "The 10% service charge is customary and optional; you rarely add more. Taxis: round up." }
	];
	TP.SERVICES = [
		["Sit-down restaurant", "15-20% (US / Canada), 10-12.5% (UK, Ireland), a few coins or rounding up in much of Europe, Australia and Asia."],
		["Food delivery", "US / Canada: 15-20% of the order or a few dollars, more for bad weather or long trips. Tips in the app usually go to the courier."],
		["Taxi / rideshare", "US / Canada: 15-20%. Most other places: round up to a convenient amount."],
		["Hairdresser / barber", "US / Canada: 15-20%. UK: around 10% is common. Elsewhere often optional."],
		["Hotel housekeeping", "US / Canada: $2-5 a night, left daily (staff change). Elsewhere a small amount at the end of the stay is welcome."],
		["Bar", "US / Canada: $1-2 a drink or 15-20% of a tab. UK, Ireland, Australia: no tip when ordering at the bar."],
		["Takeaway / counter service", "Optional everywhere. Tip jars and card prompts are a choice, not a rule."],
		["Tour guide", "Customary in many countries, often a set amount per person per day; ask your tour company what is usual."]
	];

	if (typeof module !== "undefined" && module.exports) module.exports = TP;
	else G.TP = TP;
})(typeof window !== "undefined" ? window : this);
