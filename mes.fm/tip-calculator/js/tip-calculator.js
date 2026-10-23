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

/* MES Tip Calculator -- mes.fm/tip-calculator (UI; money maths in lib.js, global TP).
 * localStorage "mes-tip-calculator:v1" = the whole form (both modes).
 * Links: ?b=<bill>&t=<tip %>|&ta=<tip amount>&p=<people>[&tax=<rate %>|&taxa=<amount>][&r=total|person&s=<step minor units>][&c=<currency>]
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("tp");
	if (!root || !window.TP) return;
	var KEY = "mes-tip-calculator:v1", CHIPS = [10, 15, 18, 20, 22, 25];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function defCur() { var l = (navigator.languages && navigator.languages[0]) || navigator.language || "en-US"; return TP.curForLocale(l); }
	function fresh() {
		return { mode: "even", cur: defCur(), bill: "", tipMode: "pct", tipPct: "18", tipAmt: "", pre: false, taxMode: "pct", tax: "", people: 1, round: "none", step: 100,
			up: [{ name: "Person 1", items: "" }, { name: "Person 2", items: "" }], us: [], utaxMode: "pct", utax: "", tipOnTax: false, country: "" };
	}
	var st = fresh();
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && typeof s === "object") st = Object.assign(fresh(), s); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function sane() {
		st.mode = st.mode === "uneven" ? "uneven" : "even";
		st.people = Math.max(1, Math.min(100, parseInt(st.people, 10) || 1));
		if (!Array.isArray(st.up) || !st.up.length) st.up = fresh().up;
		st.up = st.up.slice(0, 30).map(function (p, i) { return { name: String(p && p.name || "Person " + (i + 1)).slice(0, 40), items: String(p && p.items || "").slice(0, 300) }; });
		if (!Array.isArray(st.us)) st.us = [];
		st.us = st.us.slice(0, 30).map(function (s) { return { name: String(s && s.name || "").slice(0, 40), amt: String(s && s.amt || "").slice(0, 20), who: Array.isArray(s && s.who) ? s.who.filter(function (x) { return typeof x === "number"; }) : [] }; });
		if (["none", "total", "person"].indexOf(st.round) < 0) st.round = "none";
		if (st.mode === "uneven" && st.round === "total") st.round = "person";
		if (!TP.CURRENCIES.some(function (c) { return c.code === st.cur; })) st.cur = "USD";
		var steps = TP.steps(TP.cur(st.cur)).map(function (x) { return x[0]; });
		if (steps.indexOf(+st.step) < 0) st.step = steps[0]; else st.step = +st.step;
	}
	function fromUrl() {
		var q = new URLSearchParams(location.search);
		if (!q.has("b") && !q.has("t") && !q.has("p")) return;
		st.mode = "even";
		if (q.get("c")) st.cur = q.get("c").toUpperCase();
		if (q.has("b")) st.bill = q.get("b").slice(0, 20);
		if (q.has("ta")) { st.tipMode = "amt"; st.tipAmt = q.get("ta").slice(0, 20); } else if (q.has("t")) { st.tipMode = "pct"; st.tipPct = q.get("t").slice(0, 8); }
		if (q.has("p")) st.people = parseInt(q.get("p"), 10) || 1;
		if (q.has("tax")) { st.pre = true; st.taxMode = "pct"; st.tax = q.get("tax").slice(0, 8); } else if (q.has("taxa")) { st.pre = true; st.taxMode = "amt"; st.tax = q.get("taxa").slice(0, 20); } else st.pre = false;
		st.round = q.get("r") || "none"; if (q.get("s")) st.step = +q.get("s");
		try { history.replaceState(null, "", location.pathname + location.hash); } catch (e) {}
	}
	function toast(msg) {
		var t = $("tp-toast"); if (!t) { t = document.createElement("div"); t.id = "tp-toast"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700);
	}
	function copy(text, msg) {
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb();
	}
	function cur() { return TP.cur(st.cur); }
	function money(v) { return TP.fmt(v, cur()); }
	function m(s) { return TP.parseMoney(s, cur().dec); }
	function sumItems(s) {
		var parts = String(s || "").split(/[+;\n]/), tot = 0, bad = false, any = false;
		parts.forEach(function (p) { if (!p.trim()) return; var v = m(p); if (v == null || v < 0) bad = true; else { tot += v; any = true; } });
		return { v: tot, bad: bad, any: any };
	}
	function seg(el, val) { [].forEach.call(el.children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === String(val) || b.dataset.m === String(val))); }); }

	/* ---------- static parts ---------- */
	$("tp-cur").innerHTML = TP.CURRENCIES.map(function (c) { return '<option value="' + c.code + '">' + (c.code === "NONE" ? "No symbol" : esc(c.code + (c.sym ? " " + c.sym : ""))) + "</option>"; }).join("");
	$("tp-chips").innerHTML = CHIPS.map(function (p) { return '<button type="button" class="tp-chip" data-p="' + p + '" aria-pressed="false">' + p + "%</button>"; }).join("");
	$("tp-round").innerHTML = '<option value="none">No rounding (exact)</option><option value="total">Round the total up</option><option value="person">Round each person\'s share up</option>';
	var REG = TP.regionOf((navigator.languages && navigator.languages[0]) || navigator.language || "");
	$("tp-country").innerHTML = TP.COUNTRIES.map(function (c) { return '<option value="' + c.c + '">' + esc(c.name) + "</option>"; }).join("");
	$("tp-ctab").innerHTML = "<thead><tr><th>Country</th><th>Restaurants</th></tr></thead><tbody>" + TP.COUNTRIES.map(function (c) { return "<tr><td>" + esc(c.name) + "</td><td>" + esc(c.rest) + "</td></tr>"; }).join("") + "</tbody>";
	$("tp-stab").innerHTML = "<thead><tr><th>Service</th><th>Typical tip</th></tr></thead><tbody>" + TP.SERVICES.map(function (r) { return "<tr><td>" + esc(r[0]) + "</td><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</tbody>";

	/* ---------- uneven lists ---------- */
	function drawPeople() {
		$("tp-people").innerHTML = st.up.map(function (p, i) {
			return '<div class="tp-prow" data-i="' + i + '"><input class="tu-input tp-pname" type="text" value="' + esc(p.name) + '" aria-label="Name of person ' + (i + 1) + '" maxlength="40">' +
				'<div class="tp-money tp-money--mid tp-pitems"><span class="tp-sym" aria-hidden="true"></span><input class="tu-input tp-mid tp-pit" type="text" inputmode="decimal" autocomplete="off" placeholder="12.50 + 4" value="' + esc(p.items) + '" aria-label="What ' + esc(p.name) + ' had"></div>' +
				'<span class="tp-psum" aria-hidden="true"></span>' +
				'<button type="button" class="tp-x" aria-label="Remove ' + esc(p.name) + '"' + (st.up.length < 2 ? " disabled" : "") + '>&times;</button></div>';
		}).join("");
		drawShared();
	}
	function drawShared() {
		$("tp-shared").innerHTML = st.us.map(function (s, k) {
			var who = st.up.map(function (p, i) { var on = !s.who.length || s.who.indexOf(i) >= 0; return '<button type="button" class="tp-who" data-i="' + i + '" aria-pressed="' + on + '">' + esc(p.name || "Person " + (i + 1)) + "</button>"; }).join("");
			return '<div class="tp-srow" data-k="' + k + '"><div class="tp-sline"><input class="tu-input tp-sname" type="text" placeholder="e.g. Pizza" value="' + esc(s.name) + '" aria-label="Shared item ' + (k + 1) + ' name" maxlength="40">' +
				'<div class="tp-money tp-money--mid"><span class="tp-sym" aria-hidden="true"></span><input class="tu-input tp-mid tp-samt" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" value="' + esc(s.amt) + '" aria-label="Price of shared item ' + (k + 1) + '"></div>' +
				'<button type="button" class="tp-x" aria-label="Remove shared item ' + (k + 1) + '">&times;</button></div>' +
				'<div class="tp-whos" role="group" aria-label="Shared by"><span class="tp-light">Shared by:</span> ' + who + "</div></div>";
		}).join("");
		syms();
	}
	function syms() { [].forEach.call(root.querySelectorAll(".tp-sym"), function (e) { e.textContent = cur().sym; e.parentNode.classList.toggle("tp-money--nosym", !cur().sym); e.parentNode.classList.toggle("tp-money--long", cur().sym.length > 1); }); }

	/* ---------- sync form from state ---------- */
	function syncForm() {
		seg($("tp-mode"), st.mode);
		[].forEach.call(root.querySelectorAll("[data-only]"), function (e) { e.hidden = e.getAttribute("data-only") !== st.mode; });
		$("tp-cur").value = st.cur; $("tp-bill").value = st.bill;
		seg($("tp-tipm"), st.tipMode); $("tp-pctbox").hidden = st.tipMode !== "pct"; $("tp-amtbox").hidden = st.tipMode !== "amt";
		$("tp-tipamt").value = st.tipAmt;
		var isChip = CHIPS.indexOf(Number(st.tipPct)) >= 0 && /^\d+$/.test(String(st.tipPct));
		$("tp-pct").value = isChip ? "" : st.tipPct;
		[].forEach.call($("tp-chips").children, function (b) { b.setAttribute("aria-pressed", String(isChip && Number(b.dataset.p) === Number(st.tipPct))); });
		$("tp-pre").checked = !!st.pre; $("tp-taxrow").hidden = !st.pre; seg($("tp-taxm"), st.taxMode); $("tp-tax").value = st.tax;
		$("tp-taxlab").textContent = st.taxMode === "pct" ? "Tax rate (%)" : "Tax amount"; $("tp-tax").placeholder = st.taxMode === "pct" ? "e.g. 13" : "e.g. 6.50";
		$("tp-taxnote").hidden = st.taxMode !== "pct";
		$("tp-people-n").value = st.people;
		seg($("tp-utaxm"), st.utaxMode); $("tp-utax").value = st.utax; $("tp-utaxlab").textContent = st.utaxMode === "pct" ? "Tax rate (%)" : "Tax amount";
		$("tp-tipontax").checked = !!st.tipOnTax;
		var ro = $("tp-round"); ro.querySelector('option[value="total"]').hidden = st.mode === "uneven"; ro.value = st.round;
		$("tp-step").innerHTML = TP.steps(cur()).map(function (x) { return '<button type="button" data-v="' + x[0] + '" aria-pressed="' + (x[0] === st.step) + '">' + esc(x[1]) + "</button>"; }).join("");
		$("tp-stepbox").hidden = st.round === "none";
		$("tp-steplab").textContent = st.round === "total" ? "Total up to the next" : "Each share up to the next";
		drawPeople();
	}

	/* ---------- calculate ---------- */
	function tipOpts() {
		var pm = TP.parsePct(st.tipPct), ta = m(st.tipAmt);
		return { tipMode: st.tipMode, tipPct: pm || 0, tipAmt: ta && ta > 0 ? ta : 0, badTip: st.tipMode === "pct" ? (st.tipPct !== "" && pm == null) : (st.tipAmt !== "" && (ta == null || ta < 0)) };
	}
	function tile(label, value, sub, hero, id) { return '<div class="tp-tile' + (hero ? " tp-tile--hero" : "") + '"' + (id ? ' id="' + id + '"' : "") + '><div class="tp-tlab">' + label + '</div><div class="tp-tval">' + value + "</div>" + (sub ? '<div class="tp-tsub">' + sub + "</div>" : "") + "</div>"; }
	var last = null;
	function calc() {
		var T = tipOpts(), res = $("tp-res"), msg = [], c = cur();
		if (st.mode === "even") {
			var bill = m(st.bill), badBill = st.bill !== "" && (bill == null || bill < 0);
			$("tp-bill").classList.toggle("tp-bad", badBill);
			var taxV = st.taxMode === "pct" ? TP.parsePct(st.tax) : m(st.tax);
			var r = TP.even({ bill: bill > 0 ? bill : 0, tipMode: T.tipMode, tipPct: T.tipPct, tipAmt: T.tipAmt, preTax: st.pre, taxMode: st.taxMode, tax: st.taxMode === "amt" ? taxV || 0 : 0, taxPct: st.taxMode === "pct" ? taxV || 0 : 0, people: st.people, round: st.round, step: st.step });
			last = r;
			var each = r.people > 1;
			res.innerHTML = tile("Tip", money(r.tip), r.effPct != null ? TP.fmtPct(r.effPct) + " of " + money(r.base) : "", false) + tile("Total", money(r.total), r.people > 1 ? "for " + r.people + " people" : "", false) +
				(each ? tile("Each person pays", money(r.uneven ? r.perPersonMax : r.perPerson), r.uneven ? "(" + r.extraCents + " pay" + (r.extraCents === 1 ? "s" : "") + " " + money(r.perPersonMax) + ", the rest " + money(r.perPerson) + ")" : "tip " + money(r.tipEach[r.tipEach.length - 1]) + " each", true, "tp-each") : "");
			res.className = "tp-results" + (each ? " tp-results--3" : "");
			if (badBill) msg.push("That bill amount does not look like a number.");
			else if (!(bill > 0)) msg.push("Type the bill amount to start.");
			if (T.badTip) msg.push("Check the tip: it is not a number.");
			if (st.pre && r.tax > 0) msg.push("Tip worked out on " + money(r.base) + " (the bill minus " + money(r.tax) + " tax).");
			if (st.pre && st.taxMode === "amt" && taxV > (bill || 0)) msg.push("The tax is more than the bill, so it was capped at the bill.");
			if (r.uneven) msg.push(money(r.total) + " does not split evenly by " + r.people + ": " + r.extraCents + " " + (r.extraCents === 1 ? "person pays" : "people pay") + " one " + (c.dec ? "cent" : "unit") + " more so it adds up exactly.");
			if (st.round !== "none" && bill > 0) msg.push(r.rounded ? "Rounded up: the tip becomes " + money(r.tip) + ", that is " + TP.fmtPct(r.effPct) + "." : "Already a round amount, nothing added.");
			drawQuick(r);
		} else {
			var people = st.up.map(function (p) { var s = sumItems(p.items); return { name: p.name, items: [s.v], bad: s.bad, any: s.any }; });
			var shared = st.us.map(function (s) { var a = m(s.amt); return { name: s.name, amount: a > 0 ? a : 0, who: s.who.length ? s.who.filter(function (i) { return i < st.up.length; }) : [] }; });
			var tv = st.utaxMode === "pct" ? TP.parsePct(st.utax) : m(st.utax);
			var u = TP.uneven({ people: people, shared: shared, taxMode: st.utaxMode, tax: st.utaxMode === "amt" ? tv || 0 : 0, taxPct: st.utaxMode === "pct" ? tv || 0 : 0, tipMode: T.tipMode, tipPct: T.tipPct, tipAmt: T.tipAmt, tipOnTax: st.tipOnTax, round: st.round, step: st.step });
			last = u;
			[].forEach.call($("tp-people").children, function (row, i) { var p = people[i]; row.querySelector(".tp-pit").classList.toggle("tp-bad", p.bad); row.querySelector(".tp-psum").textContent = p.any ? money(u.rows[i].sub) : ""; });
			res.className = "tp-results";
			res.innerHTML = tile("Food and drink", money(u.subtotal), u.tax ? "+ " + money(u.tax) + " tax" : "", false) + tile("Tip", money(u.tip), u.effPct != null && u.subtotal ? TP.fmtPct(u.effPct) + " of " + money(u.base) : "", false) + tile("Total", money(u.total), "", true);
			var tb = "<thead><tr><th>Person</th><th>Had</th><th>Tax</th><th>Tip</th><th>Pays</th></tr></thead><tbody>" + u.rows.map(function (r, i) {
				return "<tr><td>" + esc(r.name || "Person " + (i + 1)) + "</td><td>" + money(r.sub) + "</td><td>" + money(r.tax) + "</td><td>" + money(r.tip) + '</td><td class="tp-pay">' + money(r.pay) + "</td></tr>";
			}).join("") + '</tbody><tfoot><tr><td>Total</td><td>' + money(u.subtotal) + "</td><td>" + money(u.tax) + "</td><td>" + money(u.tip) + '</td><td class="tp-pay">' + money(u.total) + "</td></tr></tfoot>";
			$("tp-utab").innerHTML = tb;
			if (!u.subtotal) msg.push("Type what each person had to start.");
			if (people.some(function (p) { return p.bad; })) msg.push("Some prices are not numbers (outlined in red); they were left out.");
			if (T.badTip) msg.push("Check the tip: it is not a number.");
			if (u.subtotal) msg.push("Tax and tip are shared in proportion to what each person had" + (st.us.length ? ", shared items split equally between the people ticked" : "") + ". Leftover cents go to whoever was closest to the next cent, so it adds up exactly.");
			if (st.round === "person" && u.subtotal) msg.push(u.rounded ? "Each share rounded up: the tip becomes " + money(u.tip) + " (" + TP.fmtPct(u.effPct) + ")." : "Every share is already a round amount.");
		}
		$("tp-msg").innerHTML = msg.map(esc).join("<br>");
		save();
	}
	function drawQuick(r) {
		var rows = TP.table(r.bill, r.base, r.people, [10, 12, 15, 18, 20, 22, 25]);
		var pm = st.tipMode === "pct" ? TP.parsePct(st.tipPct) : null;
		$("tp-qt").innerHTML = "<thead><tr><th>Tip</th><th>Tip amount</th><th>Total</th>" + (r.people > 1 ? "<th>Each</th>" : "") + "</tr></thead><tbody>" + rows.map(function (x) {
			return '<tr tabindex="0" data-p="' + x.pct + '"' + (pm === x.pct * 1000 ? ' class="is-active"' : "") + "><td>" + x.pct + "%</td><td>" + money(x.tip) + "</td><td>" + money(x.total) + "</td>" + (r.people > 1 ? "<td>" + money(x.each) + "</td>" : "") + "</tr>";
		}).join("") + "</tbody>";
	}
	function drawCountry() {
		var c = TP.COUNTRIES.filter(function (x) { return x.c === st.country; })[0] || TP.COUNTRIES[0];
		$("tp-country").value = c.c;
		$("tp-custom").innerHTML = '<p class="tp-crest"><b>Restaurants:</b> ' + esc(c.rest) + '</p><p class="tp-cnotes">' + esc(c.notes) + "</p>" +
			(c.pct > 0 ? '<button type="button" class="tu-btn" id="tp-usec" data-p="' + c.pct + '">Use ' + c.pct + "%</button>" : '<button type="button" class="tu-btn" id="tp-usec" data-p="0">Use 0% (no tip)</button>');
	}

	/* ---------- events ---------- */
	function setTip(p) { st.tipMode = "pct"; st.tipPct = String(p); syncForm(); calc(); }
	$("tp-mode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.mode = b.dataset.m; sane(); syncForm(); calc(); });
	$("tp-cur").addEventListener("change", function () { st.cur = this.value; sane(); syncForm(); calc(); });
	$("tp-bill").addEventListener("input", function () { st.bill = this.value; calc(); });
	$("tp-tipm").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.tipMode = b.dataset.v; syncForm(); calc(); });
	$("tp-chips").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setTip(b.dataset.p); });
	$("tp-pct").addEventListener("input", function () { st.tipPct = this.value.trim() === "" ? "18" : this.value.trim(); if (this.value.trim() === "") { syncForm(); } else [].forEach.call($("tp-chips").children, function (b) { b.setAttribute("aria-pressed", "false"); }); calc(); });
	$("tp-tipamt").addEventListener("input", function () { st.tipAmt = this.value; calc(); });
	$("tp-pre").addEventListener("change", function () { st.pre = this.checked; syncForm(); calc(); });
	$("tp-taxm").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.taxMode = b.dataset.v; st.tax = ""; syncForm(); calc(); });
	$("tp-tax").addEventListener("input", function () { st.tax = this.value; calc(); });
	function setPeople(n) { st.people = Math.max(1, Math.min(100, n)); $("tp-people-n").value = st.people; calc(); }
	$("tp-pminus").onclick = function () { setPeople(st.people - 1); };
	$("tp-pplus").onclick = function () { setPeople(st.people + 1); };
	$("tp-people-n").addEventListener("input", function () { var n = TP.parseInt(this.value); if (n) { st.people = Math.max(1, Math.min(100, n)); calc(); } });
	$("tp-people-n").addEventListener("blur", function () { this.value = st.people; });
	$("tp-round").addEventListener("change", function () { st.round = this.value; syncForm(); calc(); });
	$("tp-step").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.step = +b.dataset.v; seg($("tp-step"), st.step); calc(); });
	$("tp-utaxm").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.utaxMode = b.dataset.v; st.utax = ""; syncForm(); calc(); });
	$("tp-utax").addEventListener("input", function () { st.utax = this.value; calc(); });
	$("tp-tipontax").addEventListener("change", function () { st.tipOnTax = this.checked; calc(); });
	$("tp-people").addEventListener("input", function (e) {
		var row = e.target.closest(".tp-prow"); if (!row) return; var i = +row.dataset.i;
		if (e.target.classList.contains("tp-pname")) { st.up[i].name = e.target.value.slice(0, 40); [].forEach.call(root.querySelectorAll('.tp-who[data-i="' + i + '"]'), function (b) { b.textContent = st.up[i].name || "Person " + (i + 1); }); }
		else st.up[i].items = e.target.value;
		calc();
	});
	$("tp-people").addEventListener("click", function (e) {
		var x = e.target.closest(".tp-x"); if (!x || st.up.length < 2) return; var i = +x.closest(".tp-prow").dataset.i;
		st.up.splice(i, 1);
		st.us.forEach(function (s) { s.who = s.who.filter(function (w) { return w !== i; }).map(function (w) { return w > i ? w - 1 : w; }); });
		drawPeople(); calc();
	});
	$("tp-addp").onclick = function () { if (st.up.length >= 30) return; st.up.push({ name: "Person " + (st.up.length + 1), items: "" }); drawPeople(); calc(); var ins = $("tp-people").querySelectorAll(".tp-pit"); ins[ins.length - 1].focus(); };
	$("tp-adds").onclick = function () { if (st.us.length >= 30) return; st.us.push({ name: "", amt: "", who: [] }); drawShared(); calc(); var ins = $("tp-shared").querySelectorAll(".tp-sname"); ins[ins.length - 1].focus(); };
	$("tp-shared").addEventListener("input", function (e) { var row = e.target.closest(".tp-srow"); if (!row) return; var s = st.us[+row.dataset.k]; if (e.target.classList.contains("tp-sname")) s.name = e.target.value.slice(0, 40); else s.amt = e.target.value; calc(); });
	$("tp-shared").addEventListener("click", function (e) {
		var row = e.target.closest(".tp-srow"); if (!row) return; var k = +row.dataset.k, s = st.us[k];
		if (e.target.closest(".tp-x")) { st.us.splice(k, 1); drawShared(); calc(); return; }
		var w = e.target.closest(".tp-who"); if (!w) return;
		var all = st.up.map(function (_, i) { return i; }), sel = s.who.length ? s.who.slice() : all.slice(), i = +w.dataset.i, at = sel.indexOf(i);
		if (at >= 0) { if (sel.length === 1) { toast("At least one person shares it"); return; } sel.splice(at, 1); } else sel.push(i);
		sel.sort(function (a, b) { return a - b; });
		s.who = sel.length === all.length ? [] : sel;
		drawShared(); calc();
	});
	$("tp-qt").addEventListener("click", function (e) { var tr = e.target.closest("tr[data-p]"); if (tr) setTip(tr.dataset.p); });
	$("tp-qt").addEventListener("keydown", function (e) { if (e.key !== "Enter" && e.key !== " ") return; var tr = e.target.closest("tr[data-p]"); if (tr) { e.preventDefault(); setTip(tr.dataset.p); } });
	$("tp-country").addEventListener("change", function () { st.country = this.value; drawCountry(); save(); });
	$("tp-custom").addEventListener("click", function (e) { var b = e.target.closest("#tp-usec"); if (!b) return; setTip(b.dataset.p); toast("Tip set to " + b.dataset.p + "%"); });
	function link() {
		var q = new URLSearchParams(), c = cur();
		if (st.bill) q.set("b", st.bill.trim());
		if (st.tipMode === "amt") q.set("ta", st.tipAmt.trim()); else q.set("t", st.tipPct);
		q.set("p", st.people);
		if (st.pre && st.tax) q.set(st.taxMode === "pct" ? "tax" : "taxa", st.tax.trim());
		if (st.round !== "none") { q.set("r", st.round); q.set("s", st.step); }
		if (c.code !== defCur()) q.set("c", c.code);
		return location.origin + location.pathname + "?" + q.toString();
	}
	$("tp-link").onclick = function () {
		if (st.mode !== "even") { copy(location.origin + location.pathname, "Link copied (the uneven list stays on this device)"); return; }
		copy(link(), "Link copied");
	};
	$("tp-copy").onclick = function () {
		var r = last, lines = [];
		if (!r) return;
		if (st.mode === "even") {
			lines.push("Bill: " + money(r.bill), "Tip: " + money(r.tip) + (r.effPct != null ? " (" + TP.fmtPct(r.effPct) + ")" : ""), "Total: " + money(r.total));
			if (r.people > 1) lines.push("Each of " + r.people + ": " + (r.uneven ? money(r.perPersonMax) + " / " + money(r.perPerson) : money(r.perPerson)));
		} else {
			r.rows.forEach(function (x, i) { lines.push((x.name || "Person " + (i + 1)) + ": " + money(x.pay) + " (had " + money(x.sub) + ", tax " + money(x.tax) + ", tip " + money(x.tip) + ")"); });
			lines.push("Total: " + money(r.total) + " (tip " + money(r.tip) + ")");
		}
		copy(lines.join("\n"), "Summary copied");
	};
	$("tp-reset").onclick = function () {
		var keep = { cur: st.cur, country: st.country, tipPct: st.tipPct, mode: st.mode };
		st = Object.assign(fresh(), keep); sane(); syncForm(); calc(); $("tp-bill").focus();
	};

	/* ---------- start ---------- */
	load(); fromUrl();
	if (!st.country) st.country = TP.COUNTRIES.some(function (c) { return c.c === REG; }) ? REG : "US";
	sane(); syncForm(); drawCountry(); calc();
})();
