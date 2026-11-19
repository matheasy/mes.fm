/* MES Expense Splitter -- pure maths (global MESSplit; also require()-able in node).
 * Money is whole minor units (cents) in the trip's base currency. Every split hands out the
 * remainder cents by largest remainder, ties going to whoever has had the fewest extra cents so far,
 * so nobody always pays the odd cent.
 *
 * Trip  = {v, name, cur (base), rates {CODE: base units per 1 CODE}, days (trip length), people[], exps[], pays[], mode, hub}
 * Person= {id, name, n (nights / days stayed), a (first night, 1-based), w (share weight: 1, kid 0.5), tags []}
 * Expense={id, what, cat, payer, amt (text as typed), cur, rule equal|nights|shares|exact, who [ids] (empty = everyone),
 *          day (0 = whole trip, else only people there that night), skip [tags], sh {id: shares}, ex {id: amount text}}
 * Payment={id, from, to, amt (text), cur}   (money already handed over to settle up)
 */
(function (root) {
	"use strict";
	var S = {};
	S.CURRENCIES = [
		["USD", "$", 2, "US dollar"], ["CAD", "$", 2, "Canadian dollar"], ["EUR", "€", 2, "Euro"], ["GBP", "£", 2, "British pound"],
		["AUD", "$", 2, "Australian dollar"], ["NZD", "$", 2, "New Zealand dollar"], ["MXN", "$", 2, "Mexican peso"], ["JPY", "¥", 0, "Japanese yen"],
		["CNY", "¥", 2, "Chinese yuan"], ["KRW", "₩", 0, "South Korean won"], ["INR", "₹", 2, "Indian rupee"], ["VND", "₫", 0, "Vietnamese dong"],
		["THB", "฿", 2, "Thai baht"], ["PHP", "₱", 2, "Philippine peso"], ["IDR", "Rp", 0, "Indonesian rupiah"], ["SGD", "$", 2, "Singapore dollar"],
		["HKD", "$", 2, "Hong Kong dollar"], ["CHF", "Fr", 2, "Swiss franc"], ["SEK", "kr", 2, "Swedish krona"], ["NOK", "kr", 2, "Norwegian krone"],
		["DKK", "kr", 2, "Danish krone"], ["PLN", "zł", 2, "Polish złoty"], ["CZK", "Kč", 2, "Czech koruna"], ["HUF", "Ft", 0, "Hungarian forint"],
		["TRY", "₺", 2, "Turkish lira"], ["BRL", "R$", 2, "Brazilian real"], ["ARS", "$", 2, "Argentine peso"], ["CLP", "$", 0, "Chilean peso"],
		["COP", "$", 0, "Colombian peso"], ["ZAR", "R", 2, "South African rand"], ["AED", "د.إ", 2, "UAE dirham"], ["ILS", "₪", 2, "Israeli shekel"],
		["EGP", "E£", 2, "Egyptian pound"], ["MAD", "DH", 2, "Moroccan dirham"], ["ISK", "kr", 0, "Icelandic króna"], ["MYR", "RM", 2, "Malaysian ringgit"],
		["TWD", "$", 0, "Taiwan dollar"], ["CRC", "₡", 0, "Costa Rican colón"], ["PEN", "S/", 2, "Peruvian sol"], ["HBD", "HBD", 3, "Hive Dollar"]
	];
	var CUR = {}; S.CURRENCIES.forEach(function (c) { CUR[c[0]] = { code: c[0], sym: c[1], dec: c[2], name: c[3] }; });
	S.cur = function (code) { return CUR[code] || CUR.USD; };
	S.dec = function (code) { return S.cur(code).dec; };
	S.CATS = [["stay", "Accommodation", "🏠"], ["food", "Food & restaurants", "🍽"], ["groc", "Groceries", "🛒"], ["drink", "Alcohol & drinks", "🍷"],
		["fuel", "Fuel & transport", "🚗"], ["fun", "Activities & tickets", "🎟"], ["other", "Other", "📦"]];
	S.TAGS = [["noalc", "No alcohol"], ["veg", "Vegetarian"], ["kid", "Kid (half share)"], ["driver", "Driver"], ["nocar", "No car"]];
	S.RULES = [["equal", "Split equally"], ["nights", "By nights stayed"], ["shares", "By shares"], ["exact", "Exact amounts"]];

	/* "1,234.56", "1.234,56", "12,5", "$ 40", "12 + 4.50" -> number (null if unreadable, 0 for blank) */
	function one(s) {
		s = String(s).replace(/[\s '’]/g, "").replace(/^[^\d.,\-]+|[^\d.,]+$/g, "");
		if (!s) return null;
		var neg = s.charAt(0) === "-"; if (neg) s = s.slice(1);
		if (!/^[\d.,]+$/.test(s)) return null;
		var lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
		if (lc >= 0 && ld >= 0) { if (lc > ld) s = s.replace(/\./g, "").replace(",", "."); else s = s.replace(/,/g, ""); }
		else if (lc >= 0) { var tail = s.length - lc - 1, cnt = s.split(",").length - 1; s = (cnt === 1 && tail !== 3) ? s.replace(",", ".") : s.replace(/,/g, ""); }
		else if (ld >= 0 && s.split(".").length > 2) s = s.replace(/\./g, "");
		if (!/^\d*\.?\d*$/.test(s) || s === "." ) return null;
		var v = parseFloat(s); if (!isFinite(v)) return null;
		return neg ? -v : v;
	}
	S.parseAmount = function (str) {
		var t = String(str == null ? "" : str).trim(); if (!t) return 0;
		var parts = t.split("+"), sum = 0;
		for (var i = 0; i < parts.length; i++) { if (!parts[i].trim()) return null; var v = one(parts[i]); if (v == null) return null; sum += v; }
		return sum;
	};
	S.toMinor = function (v, dec) { var f = Math.pow(10, dec); return Math.round(v * f + (v >= 0 ? 1e-7 : -1e-7)); };
	S.fmt = function (minor, code, o) {
		o = o || {}; var c = S.cur(code), f = Math.pow(10, c.dec), neg = minor < 0, a = Math.abs(minor);
		var whole = Math.floor(a / f), frac = a - whole * f;
		var s = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (c.dec ? "." + String(frac + f).slice(1) : "");
		var out = c.sym.length > 2 || /[A-Za-z]/.test(c.sym.slice(-1)) ? s + " " + c.sym : c.sym + s;
		if (o.code) out += " " + c.code;
		return (neg ? (o.plus ? "−" : "-") : (o.plus && minor > 0 ? "+" : "")) + out;
	};

	S.uid = function () { return Math.random().toString(36).slice(2, 8); };
	function arr(x) { return Array.isArray(x) ? x : []; }
	function str(x, n) { return String(x == null ? "" : x).slice(0, n); }
	S.blank = function (cur) {
		return { v: 1, name: "", cur: cur && CUR[cur] ? cur : "USD", rates: {}, days: 2, people: [], exps: [], pays: [], mode: "min", hub: "" };
	};
	S.normalize = function (t) {
		t = t && typeof t === "object" ? t : {};
		var o = S.blank(t.cur);
		o.name = str(t.name, 80);
		o.days = Math.max(1, Math.min(365, parseInt(t.days, 10) || 1));
		o.mode = t.mode === "hub" ? "hub" : "min";
		var rates = t.rates && typeof t.rates === "object" ? t.rates : {};
		Object.keys(rates).forEach(function (k) { var v = +rates[k]; if (CUR[k] && k !== o.cur && v > 0 && isFinite(v)) o.rates[k] = v; });
		var seen = {};
		o.people = arr(t.people).slice(0, 60).map(function (p, i) {
			p = p || {}; var id = str(p.id, 12) || S.uid(); while (seen[id]) id = S.uid(); seen[id] = 1;
			var n = parseInt(p.n, 10); if (!(n >= 0)) n = o.days;
			var a = parseInt(p.a, 10); if (!(a >= 1)) a = 1;
			var w = +p.w; if (!(w >= 0) || !isFinite(w)) w = 1;
			var tags = arr(p.tags).map(function (x) { return str(x, 24).trim().toLowerCase(); }).filter(function (x, j, l) { return x && l.indexOf(x) === j; }).slice(0, 12);
			return { id: id, name: str(p.name, 40) || "Person " + (i + 1), n: Math.min(n, 365), a: Math.min(a, 365), w: Math.min(w, 20), tags: tags };
		});
		var ids = {}; o.people.forEach(function (p) { ids[p.id] = 1; });
		o.hub = ids[t.hub] ? t.hub : "";
		var cats = {}; S.CATS.forEach(function (c) { cats[c[0]] = 1; });
		var rules = { equal: 1, nights: 1, shares: 1, exact: 1 };
		o.exps = arr(t.exps).slice(0, 500).map(function (e) {
			e = e || {};
			var sh = {}, ex = {};
			if (e.sh && typeof e.sh === "object") Object.keys(e.sh).forEach(function (k) { var v = +e.sh[k]; if (ids[k] && v >= 0 && isFinite(v)) sh[k] = v; });
			if (e.ex && typeof e.ex === "object") Object.keys(e.ex).forEach(function (k) { if (ids[k]) ex[k] = str(e.ex[k], 30); });
			return { id: str(e.id, 12) || S.uid(), what: str(e.what, 80), cat: cats[e.cat] ? e.cat : "other", payer: ids[e.payer] ? e.payer : "",
				amt: str(e.amt, 60), cur: CUR[e.cur] ? e.cur : o.cur, rule: rules[e.rule] ? e.rule : "equal",
				who: arr(e.who).filter(function (x) { return ids[x]; }), day: Math.max(0, Math.min(365, parseInt(e.day, 10) || 0)),
				skip: arr(e.skip).map(function (x) { return str(x, 24).toLowerCase(); }).filter(Boolean).slice(0, 6), sh: sh, ex: ex };
		});
		o.pays = arr(t.pays).slice(0, 300).map(function (p) {
			p = p || {}; return { id: str(p.id, 12) || S.uid(), from: ids[p.from] ? p.from : "", to: ids[p.to] ? p.to : "", amt: str(p.amt, 30), cur: CUR[p.cur] ? p.cur : o.cur };
		}).filter(function (p) { return p.from && p.to && p.from !== p.to; });
		return o;
	};

	S.isKid = function (p) { return p.tags.indexOf("kid") >= 0; };
	S.weight = function (p) { return S.isKid(p) && p.w === 1 ? 0.5 : p.w; };
	S.present = function (p, day) { return !day || (day >= p.a && day < p.a + p.n); };

	/* who an expense is shared by, and their weights (before exact amounts) */
	S.sharers = function (t, e) {
		var list = t.people.filter(function (p) {
			if (e.who.length && e.who.indexOf(p.id) < 0) return false;
			if (!S.present(p, e.day)) return false;
			for (var i = 0; i < e.skip.length; i++) if (p.tags.indexOf(e.skip[i]) >= 0) return false;
			return true;
		});
		return list.map(function (p) {
			var w;
			if (e.rule === "nights") w = (e.day ? 1 : p.n) * S.weight(p);
			else if (e.rule === "shares") w = e.sh[p.id] != null ? e.sh[p.id] : 1;
			else w = S.weight(p);
			return { p: p, w: w };
		});
	};

	/* split `total` (integer, may be negative) by weights; ties for leftover cents go to the lowest tie[i] then lowest index */
	S.allocate = function (total, weights, tie) {
		var n = weights.length, out = [], sum = 0, i;
		for (i = 0; i < n; i++) sum += Math.max(0, weights[i]);
		if (!n || sum <= 0) return null;
		var sign = total < 0 ? -1 : 1, T = Math.abs(total), base = 0, rem = [];
		for (i = 0; i < n; i++) {
			var exact = T * Math.max(0, weights[i]) / sum, f = Math.floor(exact + 1e-9);
			out.push(f); base += f; rem.push({ i: i, r: exact - f, t: tie ? tie[i] : 0, z: weights[i] > 0 });
		}
		var left = T - base;
		rem.sort(function (x, y) { if (x.z !== y.z) return x.z ? -1 : 1; if (Math.abs(y.r - x.r) > 1e-9) return y.r - x.r; if (x.t !== y.t) return x.t - y.t; return x.i - y.i; });
		for (i = 0; i < left; i++) out[rem[i % n].i] += 1;
		return out.map(function (v) { return v * sign; });
	};

	S.toBase = function (t, amount, code) {
		if (code === t.cur) return { v: S.toMinor(amount, S.dec(t.cur)) };
		var r = t.rates[code]; if (!(r > 0)) return { err: "rate", v: 0 };
		return { v: S.toMinor(amount * r, S.dec(t.cur)) };
	};

	S.compute = function (trip) {
		var t = S.normalize(trip), res = { trip: t, total: 0, people: [], exps: [], byCat: {}, missingRates: [] };
		var P = {}, extra = {};
		t.people.forEach(function (p) { var r = { id: p.id, name: p.name, paid: 0, owed: 0, sent: 0, recv: 0, bal: 0, byCat: {}, n: p.n }; P[p.id] = r; res.people.push(r); extra[p.id] = 0; });
		function miss(c) { if (res.missingRates.indexOf(c) < 0) res.missingRates.push(c); }
		t.exps.forEach(function (e) {
			var r = { id: e.id, base: 0, alloc: {}, warn: "", err: "" }; res.exps.push(r);
			var a = S.parseAmount(e.amt);
			if (a == null) { r.err = "amount"; return; }
			if (!a) { r.err = "empty"; return; }
			var b = S.toBase(t, a, e.cur); if (b.err) { r.err = "rate"; miss(e.cur); return; }
			r.base = b.v;
			if (!e.payer) { r.err = "payer"; return; }
			var sh = S.sharers(t, e);
			if (!sh.length) { r.err = "nobody"; return; }
			var alloc = {};
			if (e.rule === "exact") {
				var fixed = 0, rest = [], dec = S.dec(t.cur);
				sh.forEach(function (s) {
					var txt = e.ex[s.p.id];
					if (txt != null && String(txt).trim() !== "") {
						var v = S.parseAmount(txt); if (v == null) { r.err = "exact"; return; }
						var bb = S.toBase(t, v, e.cur); alloc[s.p.id] = bb.v; fixed += bb.v;
					} else rest.push(s);
				});
				if (r.err) return;
				var left = r.base - fixed;
				if (left !== 0) {
					if (rest.length) {
						var al = S.allocate(left, rest.map(function (s) { return S.weight(s.p); }), rest.map(function (s) { return extra[s.p.id]; }));
						if (!al) { r.err = "nobody"; return; }
						rest.forEach(function (s, i) { alloc[s.p.id] = al[i]; });
						r.warn = "rest";
					} else { r.err = "exactsum"; r.diff = left; return; }
				} else rest.forEach(function (s) { alloc[s.p.id] = 0; });
			} else {
				var ws = sh.map(function (s) { return s.w; });
				var al2 = S.allocate(r.base, ws, sh.map(function (s) { return extra[s.p.id]; }));
				if (!al2) { r.err = "nobody"; return; }
				var wsum = ws.reduce(function (x, y) { return x + y; }, 0);
				sh.forEach(function (s, i) {
					alloc[s.p.id] = al2[i];
					var fair = Math.abs(r.base) * s.w / wsum;
					if (Math.abs(al2[i]) > Math.floor(fair + 1e-9)) extra[s.p.id] += 1;
				});
			}
			r.alloc = alloc;
			res.total += r.base;
			res.byCat[e.cat] = (res.byCat[e.cat] || 0) + r.base;
			P[e.payer].paid += r.base;
			Object.keys(alloc).forEach(function (id) { P[id].owed += alloc[id]; P[id].byCat[e.cat] = (P[id].byCat[e.cat] || 0) + alloc[id]; });
		});
		res.payErr = [];
		t.pays.forEach(function (p) {
			var a = S.parseAmount(p.amt); if (a == null || a <= 0) { res.payErr.push(p.id); return; }
			var b = S.toBase(t, a, p.cur); if (b.err) { miss(p.cur); res.payErr.push(p.id); return; }
			P[p.from].sent += b.v; P[p.to].recv += b.v;
		});
		res.people.forEach(function (r) { r.bal = r.paid - r.owed + r.sent - r.recv; });
		res.settle = S.settle(res.people.map(function (r) { return { id: r.id, bal: r.bal }; }), t.mode, t.hub);
		return res;
	};

	/* Fewest transfers. Exact for up to 14 people with a balance (zero-sum groups by subset DP), greedy above.
	 * mode "hub": everyone settles with one person. Returns [{from, to, amt}] (from pays to). */
	function greedy(list) {
		var cr = list.filter(function (x) { return x.bal > 0; }).map(function (x) { return { id: x.id, v: x.bal }; });
		var db = list.filter(function (x) { return x.bal < 0; }).map(function (x) { return { id: x.id, v: -x.bal }; });
		var out = [];
		while (cr.length && db.length) {
			cr.sort(function (a, b) { return b.v - a.v || (a.id < b.id ? -1 : 1); }); db.sort(function (a, b) { return b.v - a.v || (a.id < b.id ? -1 : 1); });
			var c = cr[0], d = db[0], m = Math.min(c.v, d.v);
			out.push({ from: d.id, to: c.id, amt: m });
			c.v -= m; d.v -= m;
			if (!c.v) cr.shift(); if (!d.v) db.shift();
		}
		return out;
	}
	S.settle = function (bals, mode, hub) {
		var list = bals.filter(function (x) { return x.bal !== 0; });
		if (!list.length) return [];
		if (mode === "hub" && hub && bals.some(function (x) { return x.id === hub; })) {
			return list.filter(function (x) { return x.id !== hub; }).map(function (x) {
				return x.bal < 0 ? { from: x.id, to: hub, amt: -x.bal } : { from: hub, to: x.id, amt: x.bal };
			});
		}
		var n = list.length;
		if (n > 14) return greedy(list);
		var M = 1 << n, sum = new Float64Array(M), dp = new Int8Array(M), i, m;
		for (m = 1; m < M; m++) { var lb = m & -m, bi = 31 - Math.clz32(lb); sum[m] = sum[m ^ lb] + list[bi].bal; }
		for (m = 1; m < M; m++) {
			var best = 0;
			for (i = 0; i < n; i++) if (m & (1 << i)) { var v = dp[m ^ (1 << i)]; if (v > best) best = v; }
			dp[m] = best + (sum[m] === 0 ? 1 : 0);
		}
		/* peel groups: find a zero-sum submask whose removal keeps dp optimal */
		var out = [], rest = M - 1;
		while (rest) {
			var target = dp[rest], found = 0;
			for (var sub = rest; sub; sub = (sub - 1) & rest) {
				if (sum[sub] !== 0) continue;
				var other = rest ^ sub;
				if ((other ? dp[other] : 0) === target - 1 && groupOne(sub)) { found = sub; break; }
			}
			if (!found) found = rest;
			var g = []; for (i = 0; i < n; i++) if (found & (1 << i)) g.push(list[i]);
			out = out.concat(greedy(g));
			rest ^= found;
		}
		return out;
		function groupOne(sub) { /* a group with no zero-sum proper part = dp[sub] is 1 */ return dp[sub] === 1; }
	};

	/* share link payload: compact arrays instead of objects */
	S.pack = function (trip) {
		var t = S.normalize(trip), ix = {};
		t.people.forEach(function (p, i) { ix[p.id] = i; });
		function ids(l) { return l.map(function (x) { return ix[x]; }); }
		function map(o) { var r = {}; Object.keys(o).forEach(function (k) { r[ix[k]] = o[k]; }); return r; }
		return [1, t.name, t.cur, t.rates, t.days, t.mode, t.hub ? ix[t.hub] : -1,
			t.people.map(function (p) { return [p.name, p.n, p.a, p.w, p.tags]; }),
			t.exps.map(function (e) { return [e.what, e.cat, ix[e.payer] != null ? ix[e.payer] : -1, e.amt, e.cur, e.rule, ids(e.who), e.day, e.skip, map(e.sh), map(e.ex)]; }),
			t.pays.map(function (p) { return [ix[p.from], ix[p.to], p.amt, p.cur]; })];
	};
	S.unpack = function (a) {
		if (!Array.isArray(a) || a[0] !== 1) return null;
		var people = (a[7] || []).map(function (p) { return { id: S.uid(), name: p[0], n: p[1], a: p[2], w: p[3], tags: p[4] }; });
		function id(i) { return people[i] ? people[i].id : ""; }
		function map(o) { var r = {}; Object.keys(o || {}).forEach(function (k) { if (people[k]) r[people[k].id] = o[k]; }); return r; }
		return S.normalize({ name: a[1], cur: a[2], rates: a[3], days: a[4], mode: a[5], hub: id(a[6]), people: people,
			exps: (a[8] || []).map(function (e) { return { what: e[0], cat: e[1], payer: id(e[2]), amt: e[3], cur: e[4], rule: e[5], who: (e[6] || []).map(id), day: e[7], skip: e[8], sh: map(e[9]), ex: map(e[10]) }; }),
			pays: (a[9] || []).map(function (p) { return { from: id(p[0]), to: id(p[1]), amt: p[2], cur: p[3] }; }) });
	};
	/* base64url of UTF-8 bytes */
	S.b64u = function (bytes) {
		var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
		var b = typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64");
		return b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
	};
	S.unb64u = function (str) {
		var b = String(str).replace(/-/g, "+").replace(/_/g, "/"); while (b.length % 4) b += "=";
		var s = typeof atob === "function" ? atob(b) : Buffer.from(b, "base64").toString("binary");
		var out = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out;
	};
	S.utf8 = function (s) { return typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s) : Buffer.from(s, "utf8"); };
	S.unutf8 = function (b) { return typeof TextDecoder !== "undefined" ? new TextDecoder().decode(b) : Buffer.from(b).toString("utf8"); };
	/* plain (uncompressed) link payload: "1" + base64url(JSON); the page adds "2" = deflate-raw when the browser can */
	S.encodePlain = function (trip) { return "1" + S.b64u(S.utf8(JSON.stringify(S.pack(trip)))); };
	S.decodePlain = function (s) { try { return s.charAt(0) === "1" ? S.unpack(JSON.parse(S.unutf8(S.unb64u(s.slice(1))))) : null; } catch (e) { return null; } };

	S.nameOf = function (t, id) { for (var i = 0; i < t.people.length; i++) if (t.people[i].id === id) return t.people[i].name; return "?"; };
	S.settleText = function (res) {
		var t = res.trip;
		if (!res.settle.length) return "Everyone is even. Nothing to pay.";
		return res.settle.map(function (s) { return S.nameOf(t, s.from) + " pays " + S.nameOf(t, s.to) + " " + S.fmt(s.amt, t.cur); }).join("\n");
	};
	function q(v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
	S.csv = function (res) {
		var t = res.trip, d = S.dec(t.cur), f = Math.pow(10, d), rows = [];
		function n(m) { return (m / f).toFixed(d); }
		rows.push(["Expense", "Category", "Paid by", "Amount", "Currency", "In " + t.cur, "Split"].concat(t.people.map(function (p) { return p.name; })));
		t.exps.forEach(function (e, i) {
			var r = res.exps[i]; if (r.err) return;
			var cat = S.CATS.filter(function (c) { return c[0] === e.cat; })[0];
			rows.push([e.what || "Expense " + (i + 1), cat ? cat[1] : "", S.nameOf(t, e.payer), e.amt, e.cur, n(r.base), e.rule].concat(t.people.map(function (p) { return r.alloc[p.id] != null ? n(r.alloc[p.id]) : ""; })));
		});
		rows.push([]);
		rows.push(["Person", "Nights", "Paid", "Share", "Payments sent", "Payments received", "Balance"]);
		res.people.forEach(function (p) { rows.push([p.name, p.n, n(p.paid), n(p.owed), n(p.sent), n(p.recv), n(p.bal)]); });
		rows.push([]); rows.push(["Settle up: from", "to", "amount " + t.cur]);
		res.settle.forEach(function (s) { rows.push([S.nameOf(t, s.from), S.nameOf(t, s.to), n(s.amt)]); });
		return rows.map(function (r) { return r.map(q).join(","); }).join("\n");
	};

	S.example = function () {
		var ids = ["a1", "b2", "c3", "d4", "e5"];
		return S.normalize({ name: "Whistler weekend", cur: "CAD", days: 2, rates: { USD: 1.38 }, people: [
			{ id: ids[0], name: "Alex", n: 2, tags: [] }, { id: ids[1], name: "Sam", n: 2, tags: ["noalc", "driver"] }, { id: ids[2], name: "Jordan", n: 1, tags: [] },
			{ id: ids[3], name: "Riley", n: 2, tags: ["veg"] }, { id: ids[4], name: "Mia", n: 2, tags: ["kid", "noalc"] }],
			exps: [
				{ what: "Cabin (2 nights)", cat: "stay", payer: ids[0], amt: "640", rule: "nights" },
				{ what: "Gas", cat: "fuel", payer: ids[1], amt: "92.40", rule: "equal" },
				{ what: "Beer and wine", cat: "drink", payer: ids[2], amt: "78.50", rule: "equal", skip: ["noalc"] },
				{ what: "Groceries", cat: "groc", payer: ids[3], amt: "156.30", rule: "equal" },
				{ what: "Dinner Saturday", cat: "food", payer: ids[0], amt: "210", rule: "equal", day: 2 },
				{ what: "Gondola tickets", cat: "fun", payer: ids[3], amt: "185", cur: "USD", rule: "exact", ex: { e5: "25" } }
			] });
	};

	if (typeof module !== "undefined" && module.exports) module.exports = S; else root.MESSplit = S;
})(this);
