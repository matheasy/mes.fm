/* MES Investment Tracker -- maths (global MESInv). Pure: no DOM, runs in node for the tests
 * (node tool_apps_src/investment-tracker-tests.js).
 *
 * Model (localStorage "mes-investments:v1"):
 *   {v:1, base:"CAD", method:"avg"|"fifo", assets:{key: asset}, tx:[tx], wallets:[wallet], accts:[{id,name}]}
 *   asset  = {k, kind:"s"|"c"|"e"|"m", sym, name, cur, mp?}   k = "s:<Yahoo symbol>" | "c:<CoinGecko id>" | "m:<id>" (manual price mp in cur)
 *            | "e:<ERC-20 contract>" (a token found in an Ethereum wallet; its price comes with the wallet balance)
 *   tx     = {id, d:"YYYY-MM-DD", t, a:asset key, q, p, fee, fx?, acct?, note?}
 *            t: buy | sell | div (p = cash amount) | in (transfer in, p = cost per unit or 0) | out (transfer out) | split (q = ratio, e.g. 2 for 2-for-1) | fee (p = cash amount)
 *            p and fee are in the asset's currency; fx (optional) = 1 unit of that currency in the base currency on that day.
 *   wallet = {id, chain:"btc"|"eth"|"hive"|"xrp"|"sol", addr, label, acct?}  (balances are read live, never stored)
 * Prices (from /api/invest): q = {key: {p, c, ch?, n?}}, fx = {USD:1, CAD:1.37, ...} = units per 1 USD.
 */
(function (root) {
	"use strict";
	var I = {};
	I.VERSION = 1;

	I.TYPES = [["buy", "Buy"], ["sell", "Sell"], ["div", "Dividend / interest"], ["in", "Transfer in"], ["out", "Transfer out"], ["split", "Split"], ["fee", "Fee"]];
	I.CURRENCIES = ["USD", "CAD", "EUR", "GBP", "AUD", "NZD", "CHF", "JPY", "CNY", "HKD", "SGD", "INR", "KRW", "VND", "PHP", "IDR", "THB", "MYR", "MXN", "BRL", "ZAR", "SEK", "NOK", "DKK", "PLN", "TRY", "AED", "ILS"];
	I.CHAINS = {
		btc: { name: "Bitcoin", syms: [["BTC", "c:bitcoin", "Bitcoin"]], re: /^(bc1[02-9ac-hj-np-z]{11,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/, ex: "bc1q…" },
		eth: { name: "Ethereum + 12 more networks (0x…)", short: "13 networks", noun: "Ethereum (0x…)", syms: [["ETH", "c:ethereum", "Ethereum"], ["BNB", "c:binancecoin", "BNB"], ["POL", "c:polygon-ecosystem-token", "Polygon"], ["AVAX", "c:avalanche-2", "Avalanche"], ["xDAI", "c:xdai", "xDAI"], ["MNT", "c:mantle", "Mantle"], ["S", "c:sonic-3", "Sonic"], ["CELO", "c:celo", "Celo"]], re: /^0x[0-9a-fA-F]{40}$/, ex: "0x… (read on Ethereum, Base, Arbitrum, BNB Chain, Polygon, Optimism, Avalanche and 6 more)" },
		hive: { name: "Hive (+ Hive Engine tokens)", short: "Hive", noun: "Hive", syms: [["HIVE", "c:hive", "Hive"], ["HBD", "c:hive_dollar", "Hive Backed Dollar"]], re: /^[a-z][a-z0-9.-]{2,15}$/, ex: "your Hive username (HIVE, HBD, Hive Power, savings and Hive Engine tokens)" },
		xrp: { name: "XRP Ledger (+ tokens)", short: "XRP Ledger", noun: "XRP Ledger", syms: [["XRP", "c:ripple", "XRP"]], re: /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/, ex: "r… (XRP and its tokens: RLUSD, SOLO …)" },
		sol: { name: "Solana (+ tokens)", short: "Solana", noun: "Solana", syms: [["SOL", "c:solana", "Solana"]], re: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, ex: "a Solana address (SOL and its tokens)" },
		trx: { name: "TRON (+ USDT and tokens)", short: "TRON", noun: "TRON", syms: [["TRX", "c:tron", "TRON"]], re: /^T[1-9A-HJ-NP-Za-km-z]{33}$/, ex: "T… (TRX incl. staked, USDT and popular tokens)" },
		ltc: { name: "Litecoin", syms: [["LTC", "c:litecoin", "Litecoin"]], re: /^(ltc1[02-9ac-hj-np-z]{11,87}|[LM3][1-9A-HJ-NP-Za-km-z]{25,34})$/, ex: "ltc1… or L…" },
		doge: { name: "Dogecoin", syms: [["DOGE", "c:dogecoin", "Dogecoin"]], re: /^[DA9][1-9A-HJ-NP-Za-km-z]{25,34}$/, ex: "D…" },
		ada: { name: "Cardano (+ tokens)", short: "Cardano", noun: "Cardano", syms: [["ADA", "c:cardano", "Cardano"]], re: /^(addr1[02-9ac-hj-np-z]{50,120}|stake1[02-9ac-hj-np-z]{50,60})$/, ex: "addr1… or stake1… (ADA, rewards and tokens like SNEK, MIN)" }
	};
	/* Token keys: "e:0x…" ERC-20 contract, "e:<base58 mint>" Solana token, "e:he:SYMBOL" Hive Engine token,
	   "e:xrp:<CUR>.<issuer>" XRP Ledger token, "e:ada:<policy id + asset name hex>" Cardano token */
	I.EKEY = /^e:(0x[0-9a-f]{40}|[1-9A-HJ-NP-Za-km-z]{32,44}|he:[A-Z0-9.]{1,12}|xrp:([A-Za-z0-9]{3}|[0-9A-F]{40})\.r[1-9A-HJ-NP-Za-km-z]{24,34}|ada:[0-9a-f]{56,120})$/;
	/* Where to look a token up */
	I.tokenLink = function (k) {
		var x = String(k).slice(2);
		if (/^0x/.test(x)) return ["Etherscan", "https://etherscan.io/token/" + x];
		if (/^he:/.test(x)) return ["Tribaldex", "https://tribaldex.com/trade/" + encodeURIComponent(x.slice(3))];
		if (/^xrp:/.test(x)) { var pr = x.slice(4).split("."); return ["XRPSCAN", "https://xrpscan.com/token/" + encodeURIComponent(pr[0]) + "." + pr[1]]; }
		if (/^ada:/.test(x)) return ["Cardanoscan", "https://cardanoscan.io/token/" + x.slice(4)];
		return ["Solscan", "https://solscan.io/token/" + x];
	};

	I.uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
	I.today = function (d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

	/* "1,234.50" "1.234,50" "$1 200" "(12)" -> number, NaN if not a number */
	I.num = function (s) {
		if (typeof s === "number") return s;
		s = String(s == null ? "" : s).trim();
		if (!s) return NaN;
		var neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
		s = s.replace(/[^\d.,eE+-]/g, "").replace(/^[+-]|-$/g, "");
		var c = s.lastIndexOf(","), d = s.lastIndexOf(".");
		if (c > -1 && d > -1) { if (c > d) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, ""); }
		else if (c > -1) { var tail = s.length - c - 1; s = (tail === 3 && s.indexOf(",") === c && c <= 3 && !/^0,/.test(s)) || (s.split(",").length > 2) ? s.replace(/,/g, "") : s.replace(",", "."); }
		var n = parseFloat(s);
		return isNaN(n) ? NaN : (neg ? -n : n);
	};
	I.date = function (s) {
		s = String(s == null ? "" : s).trim();
		var m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
		if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
		m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
		if (m) { var y = m[3].length === 2 ? "20" + m[3] : m[3], a = +m[1], b = +m[2], mo = a > 12 ? b : a, da = a > 12 ? a : b; return y + "-" + String(mo).padStart(2, "0") + "-" + String(da).padStart(2, "0"); }
		var t = Date.parse(s);
		if (!isNaN(t)) return I.today(new Date(t));
		return "";
	};

	/* ---------- currency ---------- */
	I.conv = function (x, from, to, fx) {
		if (!x || from === to) return x;
		var a = fx && fx[from], b = fx && fx[to];
		if (!a || !b) return NaN;
		return x * b / a;
	};
	I.fmt = function (n, cur, o) {
		o = o || {};
		if (n == null || isNaN(n)) return "–";
		var a = Math.abs(n), dp = o.dp != null ? o.dp : (a >= 1000 || cur === "JPY" || cur === "KRW" || cur === "VND" || cur === "IDR") ? 0 : 2;
		try { return new Intl.NumberFormat(o.loc || undefined, { style: "currency", currency: cur || "USD", minimumFractionDigits: dp, maximumFractionDigits: dp, signDisplay: o.sign ? "exceptZero" : "auto" }).format(n); }
		catch (e) { return (o.sign && n > 0 ? "+" : "") + n.toFixed(dp) + " " + (cur || ""); }
	};
	I.fmtQ = function (q) {
		if (q == null || isNaN(q)) return "–";
		var a = Math.abs(q), dp = a >= 1000 ? 2 : a >= 1 ? 4 : 8;
		return (+q.toFixed(dp)).toLocaleString(undefined, { maximumFractionDigits: dp });
	};
	I.fmtPct = function (x) { return x == null || !isFinite(x) ? "–" : (x > 0 ? "+" : "") + (x * 100).toFixed(Math.abs(x) < 0.1 ? 2 : 1) + "%"; };

	/* ---------- positions (cost basis) ---------- */
	function byDate(a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : (a._i - b._i); }
	/* opt: {method, base, cur(assetKey)->currency, fx (now, for trades without their own fx)} */
	I.positions = function (txs, opt) {
		opt = opt || {};
		var method = opt.method === "fifo" ? "fifo" : "avg", P = {}, warn = [];
		var list = (txs || []).map(function (t, i) { var c = Object.assign({}, t); c._i = i; return c; }).sort(byDate);
		function pos(k) { return P[k] || (P[k] = { k: k, q: 0, cost: 0, costB: 0, lots: [], real: [], inc: 0, incB: 0, fees: 0, feesB: 0, first: null }); }
		function rate(t) { var cur = opt.cur ? opt.cur(t.a) : opt.base; if (t.fx > 0) return t.fx; if (!cur || cur === opt.base) return 1; var r = I.conv(1, cur, opt.base, opt.fx); return isNaN(r) ? 1 : r; }
		list.forEach(function (t) {
			var p = pos(t.a), q = +t.q || 0, px = +t.p || 0, fee = +t.fee || 0, r = rate(t);
			if (!p.first && (t.t === "buy" || t.t === "in")) p.first = t.d;
			if (t.t === "buy" || t.t === "in") {
				if (q <= 0) return;
				var c = t.t === "buy" ? q * px + fee : q * px;
				p.q += q; p.cost += c; p.costB += c * r; p.lots.push({ q: q, c: c, cB: c * r, d: t.d });
				if (fee) { p.fees += fee; p.feesB += fee * r; }
			} else if (t.t === "sell" || t.t === "out") {
				if (q <= 0) return;
				if (q > p.q + 1e-9) { warn.push({ id: t.id, a: t.a, d: t.d, msg: "sells " + q + " but only " + (+p.q.toFixed(8)) + " held" }); q = Math.max(0, p.q); }
				if (!q) return;
				var out = take(p, q, method);
				p.q -= q; if (p.q < 1e-12) { p.q = 0; }
				p.cost -= out.c; p.costB -= out.cB;
				if (p.q === 0) { p.cost = 0; p.costB = 0; p.lots = []; }
				if (t.t === "sell") {
					var proc = q * px - fee;
					p.real.push({ id: t.id, d: t.d, y: +t.d.slice(0, 4), q: q, proc: proc, procB: proc * r, cost: out.c, costB: out.cB, gain: proc - out.c, gainB: proc * r - out.cB });
					if (fee) { p.fees += fee; p.feesB += fee * r; }
				}
			} else if (t.t === "div") {
				var amt = px || q; p.inc += amt; p.incB += amt * r;
			} else if (t.t === "fee") {
				var f = px || fee || q; p.fees += f; p.feesB += f * r;
			} else if (t.t === "split") {
				if (q > 0 && q !== 1) { p.q *= q; p.lots.forEach(function (l) { l.q *= q; }); }
			}
		});
		Object.keys(P).forEach(function (k) { delete P[k].lots; });
		return { pos: P, warn: warn };
	};
	function take(p, q, method) {
		if (method === "avg" || !p.lots.length) {
			var f = p.q > 0 ? q / p.q : 1, c = p.cost * f, cB = p.costB * f;
			if (p.lots.length) p.lots.forEach(function (l) { l.q *= (1 - f); l.c *= (1 - f); l.cB *= (1 - f); });
			return { c: c, cB: cB };
		}
		var left = q, c2 = 0, cB2 = 0;
		while (left > 1e-12 && p.lots.length) {
			var l = p.lots[0], use = Math.min(left, l.q), fr = use / l.q;
			c2 += l.c * fr; cB2 += l.cB * fr; l.q -= use; l.c -= l.c * fr; l.cB -= l.cB * fr; left -= use;
			if (l.q < 1e-12) p.lots.shift();
		}
		return { c: c2, cB: cB2 };
	}

	/* ---------- holdings with prices ----------
	 * extra = wallet balances {assetKey: qty} added on top of trade holdings (no cost basis).
	 * Returns rows + totals in the base currency. */
	I.holdings = function (state, prices, extra) {
		var base = state.base || "USD", fx = (prices && prices.fx) || {}, q = (prices && prices.q) || {};
		var cur = function (k) { var a = state.assets[k]; return (a && a.cur) || "USD"; };
		var res = I.positions(state.tx, { method: state.method, base: base, cur: cur, fx: fx });
		var keys = {}; Object.keys(res.pos).forEach(function (k) { keys[k] = 1; }); Object.keys(extra || {}).forEach(function (k) { keys[k] = 1; });
		var rows = [], T = { value: 0, cost: 0, unreal: 0, real: 0, inc: 0, fees: 0, day: 0, dayBase: 0, missing: 0, costKnown: 0 };
		Object.keys(keys).forEach(function (k) {
			var a = state.assets[k] || { k: k, sym: k.split(":")[1], name: k, cur: "USD" }, p = res.pos[k] || { q: 0, cost: 0, costB: 0, real: [], inc: 0, incB: 0, fees: 0, feesB: 0 };
			var wq = (extra && extra[k]) || 0, qty = p.q + wq, qt = q[k];
			var price = a.kind === "m" ? (+a.mp || NaN) : qt ? qt.p : NaN, pcur = a.kind === "m" ? a.cur : (qt && qt.c) || a.cur || "USD";
			var val = qty * price, valB = I.conv(val, pcur, base, fx);
			var realB = p.real.reduce(function (s, r) { return s + r.gainB; }, 0);
			var row = { k: k, a: a, q: qty, tq: p.q, wq: wq, price: price, pcur: pcur, value: valB, cost: p.costB, costOwn: p.cost,
				avg: p.q > 0 ? p.cost / p.q : NaN, unreal: p.q > 0 ? I.conv(p.q * price, pcur, base, fx) - p.costB : NaN, real: realB, inc: p.incB, fees: p.feesB,
				ch: qt && qt.ch != null ? qt.ch / 100 : null, first: p.first };
			if (!isFinite(row.value)) { row.value = NaN; if (qty > 0) T.missing++; }
			rows.push(row);
			if (isFinite(row.value)) { T.value += row.value; if (row.ch != null) { var prev = row.value / (1 + row.ch); T.day += row.value - prev; T.dayBase += prev; } }
			if (p.q > 0 && isFinite(row.unreal)) { T.cost += p.costB; T.unreal += row.unreal; T.costKnown += I.conv(p.q * price, pcur, base, fx); }
			T.real += realB; T.inc += p.incB; T.fees += p.feesB;
		});
		rows.forEach(function (r) { r.w = T.value > 0 && isFinite(r.value) ? r.value / T.value : 0; });
		rows.sort(function (x, y) { return (isFinite(y.value) ? y.value : -1) - (isFinite(x.value) ? x.value : -1); });
		T.dayPct = T.dayBase > 0 ? T.day / T.dayBase : null;
		T.unrealPct = T.cost > 0 ? T.unreal / T.cost : null;
		T.total = T.unreal + T.real + T.inc;
		return { rows: rows, T: T, warn: res.warn, pos: res.pos };
	};

	/* Realized gains grouped by year (base currency) */
	I.realizedByYear = function (pos) {
		var Y = {};
		Object.keys(pos).forEach(function (k) {
			pos[k].real.forEach(function (r) { var y = Y[r.y] || (Y[r.y] = { y: r.y, proc: 0, cost: 0, gain: 0, n: 0, rows: [] }); y.proc += r.procB; y.cost += r.costB; y.gain += r.gainB; y.n++; y.rows.push(Object.assign({ k: k }, r)); });
			if (pos[k].incB) { /* income kept separately */ }
		});
		return Object.keys(Y).sort().reverse().map(function (y) { Y[y].rows.sort(function (a, b) { return a.d < b.d ? -1 : 1; }); return Y[y]; });
	};

	/* Grouped allocation: by "asset" | "kind" | "acct" */
	I.allocation = function (rows, state, by) {
		var G = {}, KIND = { s: "Stocks & funds", c: "Crypto", e: "Crypto", m: "Other" };
		rows.forEach(function (r) {
			if (!(r.value > 0)) return;
			var key = by === "kind" ? KIND[r.a.kind] || "Other" : r.a.sym || r.k;
			G[key] = (G[key] || 0) + r.value;
		});
		var tot = Object.keys(G).reduce(function (s, k) { return s + G[k]; }, 0);
		return Object.keys(G).map(function (k) { return { label: k, value: G[k], w: tot ? G[k] / tot : 0 }; }).sort(function (a, b) { return b.value - a.value; });
	};

	/* ---------- value over time ----------
	 * hist = {key: [[YYYY-MM-DD, close], ...]} (close in the asset's price currency), fx = now rates.
	 * Returns [{d, value, invested}] for each date in dates (base currency). Prices are carried forward over weekends. */
	I.timeline = function (state, hist, fx, dates, pcur) {
		var base = state.base || "USD", txs = (state.tx || []).slice().map(function (t, i) { var c = Object.assign({}, t); c._i = i; return c; }).sort(byDate);
		var qty = {}, inv = 0, ti = 0, idx = {}, last = {}, out = [];
		var cur = function (k) { var a = state.assets[k]; return (pcur && pcur[k]) || (a && a.cur) || "USD"; };
		dates.forEach(function (d) {
			while (ti < txs.length && txs[ti].d <= d) {
				var t = txs[ti++], q = +t.q || 0, r = t.fx > 0 ? t.fx : I.conv(1, (state.assets[t.a] || {}).cur || "USD", base, fx) || 1;
				if (t.t === "buy") { qty[t.a] = (qty[t.a] || 0) + q; inv += (q * (+t.p || 0) + (+t.fee || 0)) * r; }
				else if (t.t === "in") { qty[t.a] = (qty[t.a] || 0) + q; inv += q * (+t.p || 0) * r; }
				else if (t.t === "sell") { qty[t.a] = Math.max(0, (qty[t.a] || 0) - q); inv -= (q * (+t.p || 0) - (+t.fee || 0)) * r; }
				else if (t.t === "out") { qty[t.a] = Math.max(0, (qty[t.a] || 0) - q); }
				else if (t.t === "split" && q > 0) { qty[t.a] = (qty[t.a] || 0) * q; }
			}
			var v = 0, ok = true;
			Object.keys(qty).forEach(function (k) {
				if (!qty[k]) return;
				var a = state.assets[k], h = hist[k], px = NaN;
				if (a && a.kind === "m") px = +a.mp;
				else if (h && h.length) {
					var i = idx[k] || 0;
					while (i < h.length && h[i][0] <= d) { last[k] = h[i][1]; i++; }
					idx[k] = i; px = last[k] != null ? last[k] : NaN;
				}
				var x = I.conv(qty[k] * px, cur(k), base, fx);
				if (isFinite(x)) v += x; else if (!(a && a.kind === "m")) ok = ok && !h;
			});
			out.push({ d: d, value: v, invested: inv });
		});
		return out;
	};
	I.dateRange = function (from, to, step) {
		var out = [], d = new Date(from + "T12:00:00Z"), e = new Date(to + "T12:00:00Z");
		step = step || 1;
		while (d <= e) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + step); }
		if (out[out.length - 1] !== to) out.push(to);
		return out;
	};

	/* ---------- CSV import ---------- */
	I.parseCSV = function (text) {
		text = String(text || "").replace(/^﻿/, "");
		var first = text.split(/\r?\n/).slice(0, 5).join("\n"), delim = ",";
		var counts = { "\t": (first.match(/\t/g) || []).length, ";": (first.match(/;/g) || []).length, ",": (first.match(/,/g) || []).length };
		if (counts["\t"] > counts[","] && counts["\t"] >= counts[";"]) delim = "\t"; else if (counts[";"] > counts[","]) delim = ";";
		var rows = [], row = [], f = "", q = false;
		for (var i = 0; i < text.length; i++) {
			var ch = text[i];
			if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
			else if (ch === '"') q = true;
			else if (ch === delim) { row.push(f); f = ""; }
			else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(f); f = ""; if (row.some(function (x) { return x.trim(); })) rows.push(row); row = []; }
			else f += ch;
		}
		row.push(f); if (row.some(function (x) { return x.trim(); })) rows.push(row);
		return rows.map(function (r) { return r.map(function (x) { return x.trim(); }); });
	};
	var COLS = {
		date: /^(date|trade date|transaction date|timestamp|time|settlement date|date \(utc\)|datetime|created at|run date)$/i,
		type: /^(type|action|transaction type|activity|activity type|side|transaction|operation|kind)$/i,
		sym: /^(symbol|ticker|asset|coin|currency|security|instrument|stock|asset symbol|crypto)$/i,
		q: /^(quantity|qty|shares|units|amount|quantity transacted|volume|no\.? of shares|size)$/i,
		p: /^(price|unit price|share price|price per share|spot price at transaction|rate|execution price|avg price|average price|price \(usd\))$/i,
		fee: /^(fee|fees|commission|commissions|fees and\/or spread|fee amount|trading fee)$/i,
		total: /^(total|net amount|amount \(usd\)|value|subtotal|gross amount|total \(inclusive of fees and\/or spread\)|net|proceeds)$/i,
		cur: /^(currency|price currency|spot price currency|ccy|settlement currency|quote currency)$/i,
		name: /^(name|description|security name|asset name)$/i,
		note: /^(notes?|memo|comment)$/i
	};
	I.guessColumns = function (header) {
		var m = {}, used = {};
		Object.keys(COLS).forEach(function (k) {
			for (var i = 0; i < header.length; i++) { if (used[i]) continue; if (COLS[k].test(header[i].trim())) { m[k] = i; used[i] = 1; return; } }
		});
		// "Amount" column used as quantity unless a quantity column exists; "currency" may mean the asset in crypto exports.
		if (m.sym == null && m.cur != null && m.type != null) { m.sym = m.cur; delete m.cur; }
		return m;
	};
	I.typeOf = function (s) {
		s = String(s || "").toLowerCase();
		if (/split/.test(s)) return "split";
		if (/div|interest|distribution|coupon/.test(s)) return "div";
		if (/reward|staking|income|learn|airdrop|bonus|mining|earn/.test(s)) return "reward";
		if (/sell|sold|sale|redeem|redemption/.test(s)) return "sell";
		if (/buy|bought|purchase|reinvest|drip/.test(s)) return "buy";
		if (/receive|deposit|transfer in|incoming|^in$|journal in/.test(s)) return "in";
		if (/send|withdraw|transfer out|outgoing|^out$|journal out/.test(s)) return "out";
		if (/fee|commission/.test(s)) return "fee";
		return "";
	};
	/* rows (including header) + column map -> {tx, skipped:[{n, why}], syms:{SYM: count}} */
	I.rowsToTx = function (rows, map, opt) {
		opt = opt || {};
		var out = [], skipped = [], syms = {};
		rows.slice(1).forEach(function (r, i) {
			var n = i + 2, get = function (k) { return map[k] != null ? r[map[k]] || "" : ""; };
			var sym = get("sym").toUpperCase().replace(/\s+/g, ""), d = I.date(get("date")) || (opt.defDate || "");
			var t = map.type != null ? I.typeOf(get("type")) : (opt.defType || "buy");
			var q = Math.abs(I.num(get("q"))), p = Math.abs(I.num(get("p"))), fee = Math.abs(I.num(get("fee"))), tot = Math.abs(I.num(get("total")));
			if (!sym) { skipped.push({ n: n, why: "no symbol" }); return; }
			if (!d) { skipped.push({ n: n, why: "no date" }); return; }
			if (!t) { skipped.push({ n: n, why: "type “" + get("type") + "” not understood" }); return; }
			if (t === "reward") t = "in"; // coins received as income: their value that day becomes their cost
			if (t === "div") { var amt = isFinite(tot) && tot > 0 ? tot : isFinite(p) && isFinite(q) ? p * q : q; if (!(amt > 0)) { skipped.push({ n: n, why: "no amount" }); return; } out.push({ d: d, t: "div", sym: sym, q: 0, p: amt || 0, fee: 0, cur: get("cur").toUpperCase() }); syms[sym] = (syms[sym] || 0) + 1; return; }
			if (!(q > 0)) { skipped.push({ n: n, why: "no quantity" }); return; }
			if (!(p > 0) && tot > 0 && (t === "buy" || t === "sell")) p = Math.max(0, (t === "buy" ? tot - (fee || 0) : tot + (fee || 0))) / q;
			if (!(p >= 0) || !isFinite(p)) p = 0;
			out.push({ d: d, t: t, sym: sym, q: q, p: p, fee: isFinite(fee) ? fee : 0, cur: get("cur").toUpperCase(), note: get("note") });
			syms[sym] = (syms[sym] || 0) + 1;
		});
		return { tx: out, skipped: skipped, syms: syms };
	};

	/* "buy 10 AAPL at 150 on 2026-01-05", "sell 0.5 btc @ 60000 fee 5", "AAPL 10 150" */
	I.parseQuick = function (s) {
		s = String(s || "").trim(); if (!s) return null;
		var r = { t: "buy" }, m;
		var low = s.toLowerCase();
		["sell", "buy", "div", "dividend", "in", "out"].forEach(function (w) { if (new RegExp("^" + w + "\\b").test(low)) r.t = w === "dividend" ? "div" : w; });
		s = s.replace(/^(sell|sold|buy|bought|dividend|div|in|out)\s+/i, "");
		m = s.match(/\b(?:on\s+)?(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b/i); if (m) { r.d = I.date(m[1]); s = s.replace(m[0], " "); }
		m = s.match(/\bfees?\s*[:=]?\s*\$?([\d.,]+)/i); if (m) { r.fee = I.num(m[1]); s = s.replace(m[0], " "); }
		m = s.match(/(?:@|\bat\b|\bfor\b)\s*\$?([\d.,]+)/i); if (m) { r.p = I.num(m[1]); s = s.replace(m[0], " "); }
		var parts = s.trim().split(/\s+/).filter(Boolean), nums = [];
		parts.forEach(function (w) { var n = I.num(w); if (/^[$]?[\d.,]+$/.test(w) && isFinite(n)) nums.push(n); else if (/^[A-Za-z][A-Za-z0-9.\-=^]{0,14}$/.test(w) && !/^(shares?|units?|of|x)$/i.test(w) && !r.sym) r.sym = w.toUpperCase(); });
		if (nums.length) r.q = nums[0]; if (nums.length > 1 && r.p == null) r.p = nums[1];
		if (r.t === "div" && r.p == null && r.q != null) { r.p = r.q; r.q = 0; }
		if (!r.sym) return null;
		return r;
	};

	/* ---------- wallet answers (server sends raw numbers) ---------- */
	/* Wallet balances {walletId: {b}} -> total quantity per asset, leaving out tokens the person hid on that wallet */
	I.walletQty = function (state, wb) {
		var x = {};
		(state.wallets || []).forEach(function (w) {
			var b = wb && wb[w.id] && wb[w.id].b, hide = w.hide || [];
			if (b) Object.keys(b).forEach(function (k) { if (hide.indexOf(k) < 0 && b[k] > 0) x[k] = (x[k] || 0) + b[k]; });
		});
		return x;
	};
	/* The networks an Ethereum (0x) address is read on: [id, name, native coin key, symbol] (order of the wallet card) */
	I.EVM_NETS = [["eth", "Ethereum", "c:ethereum", "ETH"], ["base", "Base", "c:ethereum", "ETH"], ["arb", "Arbitrum", "c:ethereum", "ETH"], ["bnb", "BNB Chain", "c:binancecoin", "BNB"],
		["pol", "Polygon", "c:polygon-ecosystem-token", "POL"], ["op", "Optimism", "c:ethereum", "ETH"], ["avax", "Avalanche", "c:avalanche-2", "AVAX"], ["linea", "Linea", "c:ethereum", "ETH"],
		["scroll", "Scroll", "c:ethereum", "ETH"], ["gno", "Gnosis", "c:xdai", "xDAI"], ["mnt", "Mantle", "c:mantle", "MNT"], ["sonic", "Sonic", "c:sonic-3", "S"], ["celo", "Celo", "c:celo", "CELO"]];
	I.walletOk = function (chain, addr) { var c = I.CHAINS[chain]; return !!(c && c.re.test(String(addr || "").trim())); };

	/* ---------- clean / merge / backup ---------- */
	I.blank = function (base) { return { v: 1, base: base || "USD", method: "avg", assets: {}, tx: [], wallets: [] }; };
	I.clean = function (s) {
		var o = I.blank("USD");
		if (!s || typeof s !== "object") return o;
		if (I.CURRENCIES.indexOf(s.base) >= 0) o.base = s.base;
		o.method = s.method === "fifo" ? "fifo" : "avg";
		Object.keys(s.assets || {}).forEach(function (k) {
			var a = s.assets[k]; if (!a || !(/^[scm]:[\w.\-=^ ]{1,60}$/.test(k) || I.EKEY.test(k))) return;
			o.assets[k] = { k: k, kind: k[0], sym: String(a.sym || k.slice(2)).slice(0, 20), name: String(a.name || a.sym || "").slice(0, 80), cur: I.CURRENCIES.indexOf(a.cur) >= 0 ? a.cur : "USD" };
			if (k[0] === "m") o.assets[k].mp = +a.mp || 0;
			if (a.cls) o.assets[k].cls = String(a.cls).slice(0, 30);
		});
		var types = I.TYPES.map(function (t) { return t[0]; });
		(s.tx || []).forEach(function (t) {
			if (!t || !o.assets[t.a] || types.indexOf(t.t) < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(t.d)) return;
			var c = { id: String(t.id || I.uid()).slice(0, 30), d: t.d, t: t.t, a: t.a, q: +t.q || 0, p: +t.p || 0, fee: +t.fee || 0 };
			if (t.fx > 0) c.fx = +t.fx;
			if (t.acct) c.acct = String(t.acct).slice(0, 40);
			if (t.note) c.note = String(t.note).slice(0, 200);
			o.tx.push(c);
		});
		(s.wallets || []).forEach(function (w) {
			if (!w || !I.walletOk(w.chain, w.addr)) return;
			var c = { id: String(w.id || I.uid()).slice(0, 30), chain: w.chain, addr: String(w.addr).trim(), label: String(w.label || "").slice(0, 60) };
			var hide = (Array.isArray(w.hide) ? w.hide : []).filter(function (k) { return typeof k === "string" && (/^c:[\w.\-]{1,60}$/.test(k) || I.EKEY.test(k)); }).slice(0, 200);
			if (hide.length) c.hide = hide;
			o.wallets.push(c);
		});
		return o;
	};
	I.merge = function (mine, theirs) {
		var o = I.clean(mine), t = I.clean(theirs), have = {}, added = 0;
		o.tx.forEach(function (x) { have[x.id] = 1; });
		Object.keys(t.assets).forEach(function (k) { if (!o.assets[k]) o.assets[k] = t.assets[k]; });
		t.tx.forEach(function (x) { if (!have[x.id]) { o.tx.push(x); added++; } });
		var wk = {}; o.wallets.forEach(function (w) { wk[w.chain + w.addr] = 1; });
		t.wallets.forEach(function (w) { if (!wk[w.chain + w.addr]) { o.wallets.push(w); added++; } });
		return { state: o, added: added };
	};
	I.backup = function (s) { return JSON.stringify({ app: "mes-investments", v: 1, saved: new Date().toISOString(), data: I.clean(s) }, null, 1); };
	I.readBackup = function (txt) { var j = JSON.parse(txt); return I.clean(j && j.data ? j.data : j); };
	I.txCSV = function (s) {
		var q = function (x) { x = String(x == null ? "" : x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
		var lines = [["Date", "Type", "Symbol", "Name", "Quantity", "Price", "Fee", "Currency", "FX to " + s.base, "Note"].join(",")];
		s.tx.slice().sort(function (a, b) { return a.d < b.d ? -1 : 1; }).forEach(function (t) {
			var a = s.assets[t.a] || {};
			lines.push([t.d, t.t, a.sym, a.name, t.q, t.p, t.fee, a.cur, t.fx || "", t.note || ""].map(q).join(","));
		});
		return lines.join("\n");
	};

	/* Demo portfolio for "Try an example" */
	I.example = function (base) {
		var s = I.blank(base || "USD");
		s.assets["s:AAPL"] = { k: "s:AAPL", kind: "s", sym: "AAPL", name: "Apple Inc.", cur: "USD" };
		s.assets["s:VOO"] = { k: "s:VOO", kind: "s", sym: "VOO", name: "Vanguard S&P 500 ETF", cur: "USD" };
		s.assets["c:bitcoin"] = { k: "c:bitcoin", kind: "c", sym: "BTC", name: "Bitcoin", cur: "USD" };
		s.assets["c:hive"] = { k: "c:hive", kind: "c", sym: "HIVE", name: "Hive", cur: "USD" };
		var y = new Date().getFullYear();
		s.tx = [
			{ id: "ex1", d: (y - 2) + "-01-15", t: "buy", a: "s:VOO", q: 10, p: 380, fee: 0 },
			{ id: "ex2", d: (y - 2) + "-03-02", t: "buy", a: "s:AAPL", q: 20, p: 150, fee: 4.95 },
			{ id: "ex3", d: (y - 2) + "-06-10", t: "buy", a: "c:bitcoin", q: 0.15, p: 26000, fee: 10 },
			{ id: "ex4", d: (y - 1) + "-02-20", t: "buy", a: "c:hive", q: 5000, p: 0.32, fee: 0 },
			{ id: "ex5", d: (y - 1) + "-05-14", t: "sell", a: "s:AAPL", q: 5, p: 190, fee: 4.95 },
			{ id: "ex6", d: (y - 1) + "-09-01", t: "buy", a: "s:VOO", q: 5, p: 470, fee: 0 },
			{ id: "ex7", d: (y - 1) + "-12-20", t: "div", a: "s:VOO", q: 0, p: 98.4, fee: 0 },
			{ id: "ex8", d: y + "-01-10", t: "sell", a: "c:bitcoin", q: 0.05, p: 95000, fee: 8 }
		];
		return s;
	};

	if (typeof module !== "undefined" && module.exports) module.exports = I; else root.MESInv = I;
})(typeof window !== "undefined" ? window : this);
