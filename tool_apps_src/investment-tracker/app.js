/* MES Investment Tracker -- mes.fm/investment-tracker (UI; maths in lib.js = MESInv, prices from /api/invest).
 * localStorage: "mes-investments:v1" = the portfolio (see lib.js), ":prices" = last prices (shown at once on the next visit),
 * ":wb" = last wallet balances {walletId: {b, at}}, ":tab", ":hiveenc", ":cloud".
 */
(function () {
	"use strict";
	var I = window.MESInv, $ = function (id) { return document.getElementById(id); }, root = $("iv");
	if (!I || !root) return;
	var KEY = "mes-investments:v1", API = "/api/invest";
	var CRYPTO_SYMS = /^(BTC|ETH|SOL|XRP|HIVE|HBD|DOGE|ADA|USDT|USDC|BNB|LTC|DOT|AVAX|LINK|TRX|MATIC|POL|SHIB|ATOM|XLM|XMR|BCH|ETC|NEAR|UNI|ALGO|FIL|ICP|APT|ARB|OP|SUI|TON|PEPE|DAI|KAS|HBAR|VET|AAVE|INJ|RNDR|TAO|SEI)$/;
	var COL = ["#2563eb", "#16a34a", "#f59e0b", "#db2777", "#7c3aed", "#0891b2", "#dc2626", "#65a30d", "#ea580c", "#4f46e5", "#0d9488", "#a16207"];
	var S, P, WB, H = {}, view = { tab: "hold", open: "", sort: "value", dir: -1, range: "1y", alloc: "asset", showSold: false, tq: "", tt: "", ty: "" };
	var formAsset = null, lastRes = null;

	/* ---------- storage ---------- */
	function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
	function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* full or blocked */ } }
	function defBase() {
		var l = ((navigator.languages && navigator.languages[0]) || navigator.language || "en-US").toLowerCase();
		var m = { "en-ca": "CAD", "fr-ca": "CAD", "en-gb": "GBP", "en-au": "AUD", "en-nz": "NZD", "en-in": "INR", ja: "JPY", vi: "VND", ko: "KRW", "es-mx": "MXN", "pt-br": "BRL", "de-ch": "CHF" };
		if (m[l]) return m[l]; if (m[l.slice(0, 2)]) return m[l.slice(0, 2)];
		if (/^(de|fr|es|it|nl|pt|fi|el|sk|sl|et|lv|lt)/.test(l)) return "EUR"; return "USD";
	}
	function load() {
		try { var j = JSON.parse(lsGet(KEY, "null")); S = j ? I.clean(j) : I.blank(defBase()); } catch (e) { S = I.blank(defBase()); }
		try { P = JSON.parse(lsGet(KEY + ":prices", "null")) || { q: {}, fx: { USD: 1 } }; } catch (e) { P = { q: {}, fx: { USD: 1 } }; }
		try { WB = JSON.parse(lsGet(KEY + ":wb", "null")) || {}; } catch (e) { WB = {}; }
	}
	var saveHook = null;
	function save() { lsSet(KEY, JSON.stringify(S)); if (saveHook) saveHook(); }

	/* ---------- helpers ---------- */
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function money(n, o) { return I.fmt(n, S.base, o); }
	function cls(n) { return n > 0 ? "iv-up" : n < 0 ? "iv-down" : ""; }
	function api(qs) { return fetch(API + "?" + qs).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || "HTTP " + r.status); return j; }); }); }
	function toast(msg, undo) {
		var t = $("iv-toast"); if (!t) { t = document.createElement("div"); t.id = "iv-toast"; t.className = "iv-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
		t.innerHTML = esc(msg) + (undo ? ' <button type="button">Undo</button>' : "");
		if (undo) t.querySelector("button").onclick = function () { undo(); t.classList.remove("is-on"); };
		t.classList.add("is-on"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("is-on"); }, undo ? 6000 : 2600);
	}
	function snapshot() { return JSON.stringify(S); }
	function restoreSnap(s) { S = I.clean(JSON.parse(s)); save(); render(); }
	function assetOf(k) { return S.assets[k] || { k: k, kind: k[0], sym: k.slice(2), name: k.slice(2), cur: "USD" }; }
	function kindBadge(a) { return '<span class="iv-kind iv-kind--' + a.kind + '">' + (a.kind === "c" ? "Crypto" : a.kind === "e" ? "Token" : a.kind === "m" ? "Own price" : "Stock") + "</span>"; }
	function walletExtra() {
		return I.walletQty(S, WB);
	}
	function ago(t) { if (!t) return ""; var s = Math.round((Date.now() - t) / 1000); return s < 60 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : new Date(t).toLocaleDateString(); }

	/* ---------- prices ---------- */
	var loading = false;
	function refreshPrices(quiet) {
		var ys = [], cs = [];
		Object.keys(S.assets).forEach(function (k) { if (k[0] === "s") ys.push(k.slice(2)); else if (k[0] === "c") cs.push(k.slice(2)); });
		if (!ys.length && !cs.length) { P.at = Date.now(); paintAgo(); return Promise.resolve(); }
		loading = true; paintAgo();
		var parts = [];
		for (var i = 0; i < Math.max(ys.length, cs.length); i += 50) parts.push("y=" + encodeURIComponent(ys.slice(i, i + 50).join(",")) + "&c=" + encodeURIComponent(cs.slice(i, i + 50).join(",")));
		return Promise.all(parts.map(api)).then(function (rs) {
			rs.forEach(function (r) { Object.keys(r.q).forEach(function (k) { P.q[k] = r.q[k]; }); if (r.fx) P.fx = r.fx; });
			P.at = Date.now();
			var changed = false;
			Object.keys(P.q).forEach(function (k) { var a = S.assets[k], q = P.q[k]; if (a && a.kind === "s" && q.c && a.cur !== q.c && I.CURRENCIES.indexOf(q.c) >= 0) { a.cur = q.c; changed = true; } if (a && a.kind === "s" && q.n && (!a.name || a.name === a.sym)) { a.name = q.n; changed = true; } });
			if (changed) save();
			lsSet(KEY + ":prices", JSON.stringify(P));
		}).catch(function (e) { if (!quiet) toast("Could not get prices: " + e.message); }).then(function () { loading = false; render(); });
	}
	var newAssets = false;
	function refreshWallets(only) {
		var list = S.wallets.filter(function (w) { return !only || w.id === only; });
		return Promise.all(list.map(function (w) {
			w._busy = true;
			return api("w=" + encodeURIComponent(w.chain + ":" + w.addr)).then(function (r) {
				WB[w.id] = { b: r.b, at: Date.now(), hid: r.hid || 0, src: r.src || "" };
				// tokens: make each one an asset (name + symbol from the wallet answer); "e:" tokens bring their own price
				Object.keys(r.t || {}).forEach(function (k) {
					if (!S.assets[k] && (/^c:[a-z0-9_-]{1,60}$/.test(k) || /^e:0x[0-9a-f]{40}$/.test(k))) { ensureAsset({ k: k, sym: String(r.t[k][0]).slice(0, 20), name: String(r.t[k][1] || r.t[k][0]).slice(0, 80), cur: "USD" }); newAssets = true; }
				});
				Object.keys(r.q || {}).forEach(function (k) { if (/^e:/.test(k)) P.q[k] = r.q[k]; });
				delete w._err;
			})
				.catch(function (e) { w._err = e.message; }).then(function () { w._busy = false; });
		})).then(function () {
			lsSet(KEY + ":wb", JSON.stringify(WB)); lsSet(KEY + ":prices", JSON.stringify(P));
			if (newAssets) { newAssets = false; save(); refreshPrices(true); }
			render();
		});
	}
	function paintAgo() { $("iv-ago").textContent = loading ? "Updating…" : P.at ? "Prices " + ago(P.at) : ""; }

	/* ---------- hero ---------- */
	function render() {
		lastRes = I.holdings(S, P, walletExtra());
		var T = lastRes.T, any = S.tx.length || S.wallets.length;
		var tile = function (lab, val, sub, c) { return '<div class="iv-tile"><span class="iv-tl">' + lab + '</span><b class="' + (c || "") + '">' + val + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + "</div>"; };
		$("iv-hero").innerHTML = any ? '<div class="iv-tiles">' +
			'<div class="iv-tile iv-tile--big"><span class="iv-tl">Total value</span><b>' + money(T.value) + "</b>" + (T.missing ? '<small class="iv-down">' + T.missing + " without a price</small>" : "<small>" + S.base + "</small>") + "</div>" +
			tile("Today", T.dayPct != null ? money(T.day, { sign: true }) : "–", T.dayPct != null ? I.fmtPct(T.dayPct) : "", cls(T.day)) +
			tile("Gain on what you hold", money(T.unreal, { sign: true }), T.unrealPct != null ? I.fmtPct(T.unrealPct) + " on " + money(T.cost) + " cost" : "", cls(T.unreal)) +
			tile("Realized gains", money(T.real, { sign: true }), "from sells, all years", cls(T.real)) +
			tile("Dividends & interest", money(T.inc), "received", T.inc ? "iv-up" : "") + "</div>" : "";
		var w = lastRes.warn;
		$("iv-warn").hidden = !w.length;
		if (w.length) $("iv-warn").innerHTML = "⚠ " + w.length + " sell" + (w.length > 1 ? "s" : "") + " for more than you held at the time (missing buys?): " + w.slice(0, 4).map(function (x) { return "<b>" + esc(assetOf(x.a).sym) + "</b> on " + x.d; }).join(", ") + (w.length > 4 ? "…" : "") + ". Add the missing trades so the gains are right.";
		$("iv-empty").hidden = !!any;
		paintAgo();
		paintPanel();
	}
	function paintPanel() {
		var t = view.tab;
		root.querySelectorAll(".iv-panel").forEach(function (p) { p.hidden = p.dataset.panel !== t; });
		root.querySelectorAll("#iv-tabs [role=tab]").forEach(function (b) { b.setAttribute("aria-selected", String(b.dataset.tab === t)); });
		$("iv-add").hidden = !(t === "hold" || t === "tx");
		if (t === "hold") paintHoldings(); else if (t === "tx") paintTx(); else if (t === "wal") paintWallets(); else if (t === "chart") paintCharts(); else if (t === "gain") paintGains(); else if (t === "data") paintData();
	}
	$("iv-tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) go(b.dataset.tab); });
	function go(t) { view.tab = t; lsSet(KEY + ":tab", t); paintPanel(); }
	root.addEventListener("click", function (e) { var g = e.target.closest("[data-go]"); if (g) go(g.dataset.go); });

	/* ---------- holdings ---------- */
	var HCOLS = [["sym", "Asset"], ["q", "Quantity", "num iv-hm"], ["price", "Price", "num iv-hm2"], ["value", "Value", "num"], ["avg", "Avg cost", "num iv-hm"], ["unreal", "Gain", "num"], ["w", "Share", "iv-hm"]];
	function paintHoldings() {
		var rows = lastRes.rows.filter(function (r) { return view.showSold || r.q > 1e-12; });
		var key = view.sort, dir = view.dir;
		rows.sort(function (a, b) {
			var x = key === "sym" ? a.a.sym : a[key], y = key === "sym" ? b.a.sym : b[key];
			if (key === "unreal") { x = a.cost > 0 ? a.unreal / a.cost : -1e9; y = b.cost > 0 ? b.unreal / b.cost : -1e9; }
			if (typeof x === "string") return dir * x.localeCompare(y);
			x = isFinite(x) ? x : -1e18; y = isFinite(y) ? y : -1e18; return dir * (x - y);
		});
		if (!rows.length) { $("iv-htable").innerHTML = ""; return; }
		var head = "<thead><tr>" + HCOLS.map(function (c) { return '<th class="' + (c[2] || "") + '"><button type="button" data-sort="' + c[0] + '">' + c[1] + (view.sort === c[0] ? (view.dir > 0 ? " ▲" : " ▼") : "") + "</button></th>"; }).join("") + "</tr></thead>";
		var maxW = Math.max.apply(null, rows.map(function (r) { return r.w; }).concat([0.0001]));
		var body = rows.map(function (r) {
			var a = r.a, gp = r.cost > 0 ? r.unreal / r.cost : null, open = view.open === r.k;
			var tr = '<tr class="iv-hrow' + (open ? " is-open" : "") + '" data-k="' + esc(r.k) + '" tabindex="0">' +
				'<td><span class="iv-sym">' + esc(a.sym) + "</span>" + (r.wq ? ' <span class="iv-wal" title="Includes ' + I.fmtQ(r.wq) + ' from your wallets">🔗</span>' : "") + '<small class="iv-name">' + esc(a.name && a.name !== a.sym ? a.name : "") + "</small></td>" +
				'<td class="num iv-hm">' + I.fmtQ(r.q) + "</td>" +
				'<td class="num iv-hm2">' + (isFinite(r.price) ? I.fmt(r.price, r.pcur, { dp: r.price < 1 ? 4 : 2 }) : '<span class="iv-down">no price</span>') + (r.ch != null ? '<small class="' + cls(r.ch) + '">' + I.fmtPct(r.ch) + "</small>" : "") + "</td>" +
				'<td class="num"><b>' + money(r.value) + "</b></td>" +
				'<td class="num iv-hm">' + (isFinite(r.avg) ? I.fmt(r.avg, a.cur, { dp: r.avg < 1 ? 4 : 2 }) : "–") + "</td>" +
				'<td class="num ' + cls(r.unreal) + '">' + (isFinite(r.unreal) ? money(r.unreal, { sign: true }) + '<small>' + I.fmtPct(gp) + "</small>" : r.wq && !r.tq ? '<small class="iv-muted">wallet, no cost</small>' : "–") + "</td>" +
				'<td class="iv-hm"><span class="iv-wbar"><i style="width:' + (r.w / maxW * 100).toFixed(1) + '%"></i></span><small>' + (r.w * 100).toFixed(1) + "%</small></td></tr>";
			if (open) tr += '<tr class="iv-detail"><td colspan="7">' + detailHtml(r) + "</td></tr>";
			return tr;
		}).join("");
		$("iv-htable").innerHTML = head + "<tbody>" + body + "</tbody>";
	}
	function detailHtml(r) {
		var a = r.a, list = S.tx.filter(function (t) { return t.a === r.k; }).sort(function (x, y) { return x.d < y.d ? 1 : -1; });
		var h = '<div class="iv-det">' + kindBadge(a) + " <b>" + esc(a.name || a.sym) + "</b> · " + I.fmtQ(r.q) + " at " + (isFinite(r.price) ? I.fmt(r.price, r.pcur, { dp: r.price < 1 ? 4 : 2 }) : "no price") + (isFinite(r.avg) ? " · average cost " + I.fmt(r.avg, a.cur, { dp: r.avg < 1 ? 4 : 2 }) : "");
		if (r.real) h += ' · realized <b class="' + cls(r.real) + '">' + money(r.real, { sign: true }) + "</b>";
		if (r.inc) h += " · income <b>" + money(r.inc) + "</b>";
		if (a.kind === "m") h += '<div class="iv-mp"><label>Price per unit (' + esc(a.cur) + ') <input class="tu-input" type="text" inputmode="decimal" data-mp="' + esc(r.k) + '" value="' + (a.mp || "") + '"></label> <select class="tu-select" data-mpc="' + esc(r.k) + '">' + I.CURRENCIES.map(function (c) { return "<option" + (c === a.cur ? " selected" : "") + ">" + c + "</option>"; }).join("") + "</select></div>";
		h += '<div class="iv-detbtns"><button type="button" class="tu-btn" data-addfor="' + esc(r.k) + '">+ Trade for ' + esc(a.sym) + "</button>";
		if (a.kind === "s") h += ' <a class="tu-btn tu-btn--ghost" href="https://finance.yahoo.com/quote/' + encodeURIComponent(a.sym) + '" target="_blank" rel="noopener">Yahoo Finance ↗</a>';
		if (a.kind === "c") h += ' <a class="tu-btn tu-btn--ghost" href="https://www.coingecko.com/en/coins/' + encodeURIComponent(r.k.slice(2)) + '" target="_blank" rel="noopener">CoinGecko ↗</a>';
		if (a.kind === "e") h += ' <a class="tu-btn tu-btn--ghost" href="https://etherscan.io/token/' + encodeURIComponent(r.k.slice(2)) + '" target="_blank" rel="noopener">Etherscan ↗</a>';
		if (!list.length) h += ' <button type="button" class="tu-btn tu-btn--ghost" data-delasset="' + esc(r.k) + '">Remove</button>';
		h += "</div>";
		if (list.length) h += '<table class="iv-mini"><tbody>' + list.slice(0, 12).map(txRowMini).join("") + "</tbody></table>" + (list.length > 12 ? '<p class="tu-note">' + (list.length - 12) + ' older trades on the <a href="#" data-go="tx">Trades</a> tab.</p>' : "");
		return h + "</div>";
	}
	function typeName(t) { for (var i = 0; i < I.TYPES.length; i++) if (I.TYPES[i][0] === t) return I.TYPES[i][1]; return t; }
	function txRowMini(t) { var a = assetOf(t.a); return "<tr><td>" + t.d + "</td><td>" + typeName(t.t) + "</td><td class='num'>" + txAmount(t, a) + "</td><td>" + esc(t.note || "") + "</td><td class='num'><button type='button' class='iv-ib' data-edit='" + esc(t.id) + "' title='Edit'>✎</button></td></tr>"; }
	function txAmount(t, a) {
		if (t.t === "div" || t.t === "fee") return I.fmt(t.p || t.q, a.cur);
		if (t.t === "split") return t.q + " for 1";
		return I.fmtQ(t.q) + (t.p ? " × " + I.fmt(t.p, a.cur, { dp: t.p < 1 ? 4 : 2 }) : "") + (t.fee ? " + " + I.fmt(t.fee, a.cur) + " fee" : "");
	}
	$("iv-htable").addEventListener("click", function (e) {
		var s = e.target.closest("[data-sort]");
		if (s) { var k = s.dataset.sort; if (view.sort === k) view.dir = -view.dir; else { view.sort = k; view.dir = k === "sym" ? 1 : -1; } paintHoldings(); return; }
		var b = e.target.closest("[data-addfor]"); if (b) { openForm(null, b.dataset.addfor); return; }
		var ed = e.target.closest("[data-edit]"); if (ed) { editTx(ed.dataset.edit); return; }
		var da = e.target.closest("[data-delasset]"); if (da) { var snap = snapshot(); delete S.assets[da.dataset.delasset]; save(); render(); toast("Removed", function () { restoreSnap(snap); }); return; }
		if (e.target.closest("input,select,a,button")) return;
		var row = e.target.closest(".iv-hrow"); if (row) { view.open = view.open === row.dataset.k ? "" : row.dataset.k; paintHoldings(); }
	});
	$("iv-htable").addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.classList.contains("iv-hrow")) { view.open = view.open === e.target.dataset.k ? "" : e.target.dataset.k; paintHoldings(); } });
	$("iv-htable").addEventListener("change", function (e) {
		var t = e.target;
		if (t.dataset.mp) { var a = S.assets[t.dataset.mp]; if (a) { a.mp = Math.max(0, I.num(t.value) || 0); save(); render(); } }
		if (t.dataset.mpc) { var b = S.assets[t.dataset.mpc]; if (b) { b.cur = t.value; save(); render(); } }
	});
	$("iv-showsold").addEventListener("change", function () { view.showSold = this.checked; paintHoldings(); });

	/* ---------- add / edit form ---------- */
	$("iv-ft").innerHTML = I.TYPES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + "</option>"; }).join("");
	function formLabels() {
		var t = $("iv-ft").value, cur = formAsset ? (formAsset.cur || "USD") : "USD";
		$("iv-fpc").textContent = cur;
		$("iv-fqw").hidden = t === "div" || t === "fee";
		$("iv-fpw").hidden = t === "split" || t === "out";
		$("iv-ffw").hidden = !(t === "buy" || t === "sell");
		$("iv-fxw").hidden = t === "split" || t === "out" || cur === S.base;
		$("iv-fql").textContent = t === "split" ? "New shares for each old share" : "Quantity";
		$("iv-fpl").textContent = t === "div" ? "Amount received" : t === "fee" ? "Amount" : t === "in" ? "Cost per unit (optional)" : "Price per unit";
		$("iv-fxl").textContent = "1 " + cur + " in " + S.base + " that day";
		var q = I.num($("iv-fq").value), p = I.num($("iv-fp").value), f = I.num($("iv-ff").value) || 0, tot = "";
		if ((t === "buy" || t === "sell") && q > 0 && p >= 0) tot = (t === "buy" ? "Total cost " : "You got ") + I.fmt(t === "buy" ? q * p + f : q * p - f, cur);
		$("iv-ftotal").textContent = tot;
	}
	["iv-ft", "iv-fq", "iv-fp", "iv-ff"].forEach(function (id) { $(id).addEventListener("input", formLabels); });
	function openForm(tx, assetKey) {
		var f = $("iv-form"); f.hidden = false; $("iv-formbtn").setAttribute("aria-expanded", "true");
		$("iv-fid").value = tx ? tx.id : "";
		$("iv-ft").value = tx ? tx.t : "buy";
		$("iv-fd").value = tx ? tx.d : I.today();
		$("iv-fq").value = tx && tx.q ? tx.q : ""; $("iv-fp").value = tx && tx.p ? tx.p : ""; $("iv-ff").value = tx && tx.fee ? tx.fee : ""; $("iv-fx").value = tx && tx.fx ? tx.fx : ""; $("iv-fn").value = tx ? tx.note || "" : "";
		var k = tx ? tx.a : assetKey;
		if (k) pickAsset(Object.assign({}, assetOf(k))); else { formAsset = null; $("iv-fa").value = ""; $("iv-picked").textContent = ""; }
		$("iv-fsave").textContent = tx ? "Save changes" : "Add trade";
		formLabels();
		if (view.tab !== "hold" && view.tab !== "tx") go("hold");
		$("iv-add").scrollIntoView({ block: "nearest", behavior: "smooth" });
		(k ? $("iv-fq") : $("iv-fa")).focus();
	}
	function editTx(id) { var t = S.tx.filter(function (x) { return x.id === id; })[0]; if (t) openForm(t); }
	function closeForm() { $("iv-form").hidden = true; $("iv-formbtn").setAttribute("aria-expanded", "false"); hideAc(); }
	$("iv-formbtn").addEventListener("click", function () { if ($("iv-form").hidden) openForm(); else closeForm(); });
	$("iv-fcancel").addEventListener("click", closeForm);
	$("iv-form").addEventListener("submit", function (e) {
		e.preventDefault();
		if (!formAsset) { $("iv-fa").focus(); toast("Pick a stock, fund or coin first"); return; }
		var t = $("iv-ft").value, d = $("iv-fd").value || I.today(), q = I.num($("iv-fq").value), p = I.num($("iv-fp").value), fee = I.num($("iv-ff").value), fx = I.num($("iv-fx").value);
		if ((t === "buy" || t === "sell" || t === "in" || t === "out") && !(q > 0)) { $("iv-fq").focus(); toast("Type how many"); return; }
		if (t === "split" && !(q > 0)) { $("iv-fq").focus(); toast("Type the split ratio, e.g. 2"); return; }
		if ((t === "buy" || t === "sell" || t === "div" || t === "fee") && !(p >= 0)) { $("iv-fp").focus(); toast(t === "div" || t === "fee" ? "Type the amount" : "Type the price"); return; }
		var snap = snapshot();
		ensureAsset(formAsset);
		var id = $("iv-fid").value, tx = { id: id || I.uid(), d: d, t: t, a: formAsset.k, q: t === "div" || t === "fee" ? 0 : q, p: t === "split" || t === "out" ? 0 : (p || 0), fee: fee > 0 ? fee : 0 };
		if (fx > 0) tx.fx = fx; var note = $("iv-fn").value.trim(); if (note) tx.note = note;
		if (id) S.tx = S.tx.map(function (x) { return x.id === id ? tx : x; }); else S.tx.push(tx);
		S = I.clean(S); save(); closeForm(); render();
		toast(id ? "Trade saved" : typeName(t) + " added: " + assetOf(tx.a).sym, function () { restoreSnap(snap); });
		if (!P.q[tx.a] && tx.a[0] !== "m") refreshPrices(true);
	});
	function ensureAsset(a) {
		if (S.assets[a.k]) return S.assets[a.k];
		S.assets[a.k] = { k: a.k, kind: a.k[0], sym: a.sym, name: a.name || a.sym, cur: a.cur || "USD" };
		if (a.k[0] === "m") S.assets[a.k].mp = a.mp || 0;
		return S.assets[a.k];
	}
	function pickAsset(a) {
		formAsset = a;
		$("iv-fa").value = a.sym + (a.name && a.name !== a.sym ? " · " + a.name : "");
		$("iv-picked").innerHTML = kindBadge({ kind: a.k[0] }) + (a.ex ? " " + esc(a.ex) : "");
		hideAc(); formLabels();
		if (a.k[0] !== "m" && (!P.q[a.k] || !S.assets[a.k])) {
			var qs = a.k[0] === "s" ? "y=" + encodeURIComponent(a.k.slice(2)) : "c=" + encodeURIComponent(a.k.slice(2));
			api(qs).then(function (r) {
				var q = r.q[a.k]; if (!q) return;
				P.q[a.k] = q; if (r.fx) P.fx = r.fx;
				if (formAsset === a) { a.cur = q.c || a.cur; if (q.n && a.k[0] === "s") a.name = q.n; prefillPrice(); formLabels(); }
			}).catch(function () { /* price optional */ });
		} else prefillPrice();
	}
	function prefillPrice() {
		var q = formAsset && P.q[formAsset.k];
		if (q && !$("iv-fp").value && ($("iv-fd").value || I.today()) === I.today() && /^(buy|sell|in)$/.test($("iv-ft").value)) { $("iv-fp").value = +q.p.toPrecision(6); formLabels(); }
	}

	/* ---------- autocomplete ---------- */
	var acTimer = null, acItems = [], acSel = -1, acSeq = 0;
	function hideAc() { $("iv-acl").hidden = true; $("iv-fa").setAttribute("aria-expanded", "false"); }
	function paintAc() {
		var l = $("iv-acl");
		if (!acItems.length) { hideAc(); return; }
		l.innerHTML = acItems.map(function (x, i) {
			return '<li role="option" data-i="' + i + '"' + (i === acSel ? ' aria-selected="true"' : "") + "><b>" + esc(x.sym) + "</b> " + esc(x.name || "") + '<small>' + esc(x.ex || (x.k[0] === "m" ? "Your own price" : "")) + "</small></li>";
		}).join("");
		l.hidden = false; $("iv-fa").setAttribute("aria-expanded", "true");
	}
	$("iv-fa").addEventListener("input", function () {
		formAsset = null; $("iv-picked").textContent = "";
		var q = this.value.trim(); clearTimeout(acTimer);
		if (!q) { acItems = []; paintAc(); return; }
		var U = q.toUpperCase(), held = Object.keys(S.assets).map(function (k) { return S.assets[k]; }).filter(function (a) { return a.sym.toUpperCase().indexOf(U) === 0 || (a.name || "").toUpperCase().indexOf(U) >= 0; }).slice(0, 5)
			.map(function (a) { return { k: a.k, sym: a.sym, name: a.name, cur: a.cur, ex: "In your portfolio" }; });
		var manual = { k: "m:" + I.uid(), sym: q.slice(0, 20).toUpperCase(), name: q.slice(0, 80), cur: S.base, ex: "Add as my own asset (I type the price)" };
		acItems = held.concat([manual]); acSel = held.length ? 0 : -1; paintAc();
		var seq = ++acSeq;
		acTimer = setTimeout(function () {
			api("search=" + encodeURIComponent(q)).then(function (r) {
				if (seq !== acSeq) return;
				var have = {}; held.forEach(function (h) { have[h.k] = 1; });
				acItems = held.concat(r.r.filter(function (x) { return !have[x.k]; })).concat([manual]); acSel = 0; paintAc();
			}).catch(function () { /* keep local results */ });
		}, 250);
	});
	$("iv-fa").addEventListener("keydown", function (e) {
		if ($("iv-acl").hidden) return;
		if (e.key === "ArrowDown") { e.preventDefault(); acSel = Math.min(acItems.length - 1, acSel + 1); paintAc(); }
		else if (e.key === "ArrowUp") { e.preventDefault(); acSel = Math.max(0, acSel - 1); paintAc(); }
		else if (e.key === "Enter") { if (acSel >= 0) { e.preventDefault(); pickAsset(acItems[acSel]); $("iv-fq").focus(); } }
		else if (e.key === "Escape") hideAc();
	});
	$("iv-acl").addEventListener("mousedown", function (e) { var li = e.target.closest("li"); if (!li) return; e.preventDefault(); pickAsset(acItems[+li.dataset.i]); $("iv-fq").focus(); });
	$("iv-fa").addEventListener("blur", function () { setTimeout(hideAc, 150); });

	/* ---------- quick add ---------- */
	function resolveSym(sym, preferCrypto) {
		var U = sym.toUpperCase();
		var held = Object.keys(S.assets).filter(function (k) { return S.assets[k].sym.toUpperCase() === U; });
		if (held.length) return Promise.resolve(Object.assign({}, S.assets[held[0]]));
		return api("search=" + encodeURIComponent(sym)).then(function (r) {
			var ex = r.r.filter(function (x) { return x.sym.toUpperCase() === U; });
			if (!ex.length) ex = r.r.filter(function (x) { return x.sym.toUpperCase().split(".")[0] === U; });
			if (!ex.length) return null;
			var cr = ex.filter(function (x) { return x.kind === "c"; }), st = ex.filter(function (x) { return x.kind === "s"; });
			if (preferCrypto == null) preferCrypto = CRYPTO_SYMS.test(U);
			return (preferCrypto ? cr[0] || st[0] : st[0] || cr[0]);
		});
	}
	$("iv-quick").addEventListener("submit", function (e) {
		e.preventDefault();
		var txt = $("iv-qtext").value, r = I.parseQuick(txt), note = $("iv-qnote");
		if (!r) { note.textContent = "Type something like: buy 10 AAPL at 150"; note.className = "iv-qnote is-err"; return; }
		if (r.t !== "div" && !(r.q > 0)) { note.textContent = "How many? e.g. buy 10 " + r.sym; note.className = "iv-qnote is-err"; return; }
		note.textContent = "Looking up " + r.sym + "…"; note.className = "iv-qnote";
		resolveSym(r.sym).then(function (a) {
			if (!a) { note.innerHTML = "Couldn't find “" + esc(r.sym) + "”. Use the full form to pick it, or add it as your own asset."; note.className = "iv-qnote is-err"; return; }
			var getPrice = r.p != null ? Promise.resolve(null) : api(a.k[0] === "s" ? "y=" + encodeURIComponent(a.k.slice(2)) : "c=" + encodeURIComponent(a.k.slice(2))).then(function (j) { if (j.fx) P.fx = j.fx; return j.q[a.k] || null; }).catch(function () { return null; });
			return getPrice.then(function (q) {
				if (q) { P.q[a.k] = q; a.cur = q.c || a.cur; if (q.n && a.k[0] === "s") a.name = q.n; }
				var p = r.p != null ? r.p : q ? q.p : NaN;
				if (!(p >= 0)) { note.textContent = "No price found for " + a.sym + ": add the price, e.g. … at 150"; note.className = "iv-qnote is-err"; return; }
				var snap = snapshot(); ensureAsset(a);
				var tx = { id: I.uid(), d: r.d || I.today(), t: r.t, a: a.k, q: r.t === "div" ? 0 : r.q, p: p, fee: r.fee || 0 };
				S.tx.push(tx); S = I.clean(S); save(); render();
				note.innerHTML = "✓ " + esc(typeName(tx.t)) + " " + (tx.t === "div" ? I.fmt(p, a.cur) : I.fmtQ(tx.q) + " " + esc(a.sym) + " at " + I.fmt(p, a.cur, { dp: p < 1 ? 4 : 2 })) + " on " + tx.d + (r.p == null ? " (today's price)" : "") + ' <button type="button" class="iv-link" id="iv-qundo">Undo</button>';
				note.className = "iv-qnote is-ok"; $("iv-qtext").value = "";
				$("iv-qundo").onclick = function () { restoreSnap(snap); note.textContent = "Undone."; };
				refreshPrices(true);
			});
		}).catch(function (x) { note.textContent = "Couldn't look it up: " + x.message; note.className = "iv-qnote is-err"; });
	});

	/* ---------- trades list ---------- */
	$("iv-ttype").innerHTML = '<option value="">All types</option>' + I.TYPES.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + "</option>"; }).join("");
	function paintTx() {
		var years = {}; S.tx.forEach(function (t) { years[t.d.slice(0, 4)] = 1; });
		var ys = Object.keys(years).sort().reverse(), sel = $("iv-tyear");
		sel.innerHTML = '<option value="">All years</option>' + ys.map(function (y) { return "<option" + (y === view.ty ? " selected" : "") + ">" + y + "</option>"; }).join("");
		var q = view.tq.toLowerCase(), warn = {}; lastRes.warn.forEach(function (w) { warn[w.id] = w.msg; });
		var list = S.tx.filter(function (t) {
			var a = assetOf(t.a);
			return (!view.tt || t.t === view.tt) && (!view.ty || t.d.slice(0, 4) === view.ty) && (!q || (a.sym + " " + a.name + " " + (t.note || "")).toLowerCase().indexOf(q) >= 0);
		}).sort(function (x, y) { return x.d < y.d ? 1 : x.d > y.d ? -1 : 0; });
		if (!S.tx.length) { $("iv-ttable").innerHTML = '<tbody><tr><td class="iv-muted">No trades yet. Add one above or import a CSV.</td></tr></tbody>'; return; }
		$("iv-ttable").innerHTML = "<thead><tr><th>Date</th><th>Type</th><th>Asset</th><th class='num'>Amount</th><th class='num iv-hm'>Total</th><th class='iv-hm'>Note</th><th></th></tr></thead><tbody>" + list.map(function (t) {
			var a = assetOf(t.a), tot = t.t === "buy" ? t.q * t.p + t.fee : t.t === "sell" ? t.q * t.p - t.fee : t.t === "div" || t.t === "fee" ? t.p : t.t === "in" && t.p ? t.q * t.p : NaN;
			return "<tr" + (warn[t.id] ? ' class="iv-bad" title="' + esc(warn[t.id]) + '"' : "") + "><td>" + t.d + "</td><td><span class='iv-tt iv-tt--" + t.t + "'>" + typeName(t.t) + "</span></td><td><b>" + esc(a.sym) + "</b></td><td class='num'>" + txAmount(t, a) + "</td><td class='num iv-hm'>" + (isFinite(tot) ? I.fmt(tot, a.cur) : "") + "</td><td class='iv-hm'>" + esc(t.note || "") + (warn[t.id] ? " ⚠" : "") + "</td><td class='num iv-nowrap'><button type='button' class='iv-ib' data-edit='" + esc(t.id) + "' title='Edit'>✎</button><button type='button' class='iv-ib' data-del='" + esc(t.id) + "' title='Delete'>🗑</button></td></tr>";
		}).join("") + "</tbody>" + (list.length < S.tx.length ? "<tfoot><tr><td colspan='7' class='iv-muted'>Showing " + list.length + " of " + S.tx.length + "</td></tr></tfoot>" : "");
	}
	$("iv-ttable").addEventListener("click", function (e) {
		var ed = e.target.closest("[data-edit]"); if (ed) { editTx(ed.dataset.edit); return; }
		var d = e.target.closest("[data-del]"); if (d) { var snap = snapshot(); S.tx = S.tx.filter(function (x) { return x.id !== d.dataset.del; }); save(); render(); toast("Trade deleted", function () { restoreSnap(snap); }); }
	});
	$("iv-tsearch").addEventListener("input", function () { view.tq = this.value; paintTx(); });
	$("iv-ttype").addEventListener("change", function () { view.tt = this.value; paintTx(); });
	$("iv-tyear").addEventListener("change", function () { view.ty = this.value; paintTx(); });

	/* ---------- wallets ---------- */
	$("iv-wchain").innerHTML = Object.keys(I.CHAINS).map(function (c) { return '<option value="' + c + '">' + I.CHAINS[c].name + "</option>"; }).join("");
	function wChainHint() { $("iv-waddr").placeholder = "Address: " + I.CHAINS[$("iv-wchain").value].ex; }
	$("iv-wchain").addEventListener("change", wChainHint); wChainHint();
	$("iv-wform").addEventListener("submit", function (e) {
		e.preventDefault();
		var ch = $("iv-wchain").value, ad = $("iv-waddr").value.trim(), note = $("iv-wnote");
		if (ch === "hive") ad = ad.replace(/^@/, "").toLowerCase();
		if (!I.walletOk(ch, ad)) { note.textContent = "That doesn't look like a " + I.CHAINS[ch].name + " address."; note.className = "iv-qnote is-err"; return; }
		if (S.wallets.some(function (w) { return w.chain === ch && w.addr === ad; })) { note.textContent = "That wallet is already in the list."; note.className = "iv-qnote is-err"; return; }
		var w = { id: I.uid(), chain: ch, addr: ad, label: $("iv-wlabel").value.trim() };
		S.wallets.push(w);
		I.CHAINS[ch].syms.forEach(function (s) { ensureAsset({ k: s[1], sym: s[0], name: s[2], cur: "USD" }); });
		save(); $("iv-waddr").value = ""; $("iv-wlabel").value = ""; note.textContent = "Reading the balance…"; note.className = "iv-qnote";
		render();
		refreshWallets(w.id).then(function () { var x = S.wallets.filter(function (y) { return y.id === w.id; })[0]; note.textContent = x && x._err ? "Couldn't read it: " + x._err : "✓ Added."; note.className = "iv-qnote " + (x && x._err ? "is-err" : "is-ok"); refreshPrices(true); });
	});
	function paintWallets() {
		if (!S.wallets.length) { $("iv-wlist").innerHTML = ""; return; }
		var fx = P.fx || {};
		$("iv-wlist").innerHTML = '<div class="iv-wcards">' + S.wallets.map(function (w) {
			var b = WB[w.id], c = I.CHAINS[w.chain], tot = 0;
			var bal = b && b.b ? b.b : null, hide = w.hide || [];
			// the chain's own coins first (always shown), then its tokens, biggest value first
			var keys = c.syms.map(function (s) { return s[1]; });
			var val = function (k) { var pr = P.q[k]; return bal && pr ? I.conv((bal[k] || 0) * pr.p, pr.c || "USD", S.base, fx) : NaN; };
			var toks = bal ? Object.keys(bal).filter(function (k) { return keys.indexOf(k) < 0 && bal[k] > 0; }) : [];
			toks.sort(function (x, y) { return (val(y) || 0) - (val(x) || 0); });
			var shown = toks.filter(function (k) { return hide.indexOf(k) < 0; }), hidden = toks.filter(function (k) { return hide.indexOf(k) >= 0; });
			var line = function (k, sym, tok) {
				var q = bal ? bal[k] || 0 : null, v = val(k);
				if (isFinite(v)) tot += v;
				return "<div class='iv-wline'><span>" + esc(sym) + "</span><b>" + (q == null ? "…" : I.fmtQ(q)) + "</b><small>" + (isFinite(v) ? money(v) : "") + "</small>" +
					(tok ? '<button type="button" class="iv-ib iv-whide" data-whide="' + esc(w.id) + '" data-k="' + esc(k) + '" title="Hide this token (not counted)">✕</button>' : "") + "</div>";
			};
			var lines = c.syms.map(function (s) { return line(s[1], s[0], false); }).join("");
			if (shown.length) {
				var many = shown.length > 6 && !w._open;
				lines += '<div class="iv-wtoks"><div class="iv-wsub">Tokens</div>' + (many ? shown.slice(0, 5) : shown).map(function (k) { return line(k, assetOf(k).sym, true); }).join("") +
					(many ? (function () { shown.slice(5).forEach(function (k) { var v = val(k); if (isFinite(v)) tot += v; }); return '<button type="button" class="iv-link" data-wopen="' + esc(w.id) + '">Show all ' + shown.length + " tokens</button>"; })() : "") + "</div>";
			}
			var foot = [];
			if (hidden.length) foot.push('<button type="button" class="iv-link" data-wunhide="' + esc(w.id) + '">' + hidden.length + " hidden by you · show</button>");
			if (b && b.hid) foot.push('<span title="Tokens with no real trading (often airdropped spam) are left out.">' + b.hid + " unknown or spam token" + (b.hid === 1 ? "" : "s") + " left out</span>");
			if (b && b.src === "rpc") foot.push("<span>Only popular tokens were checked this time</span>");
			if (foot.length) lines += '<p class="iv-wnote">' + foot.join(" · ") + "</p>";
			return '<div class="iv-wcard"><div class="iv-whead"><b>' + esc(w.label || c.name) + '</b><span class="iv-kind iv-kind--c">' + esc(c.name) + "</span></div>" +
				'<code class="iv-addr" title="' + esc(w.addr) + '">' + esc(w.addr.length > 24 ? w.addr.slice(0, 10) + "…" + w.addr.slice(-8) : w.addr) + "</code>" + lines +
				(w._err ? '<p class="iv-qnote is-err">' + esc(w._err) + "</p>" : "") +
				'<div class="iv-wfoot"><span class="iv-muted">' + (w._busy ? "Updating…" : b ? "Read " + ago(b.at) : "") + " · " + money(tot) + '</span><span><button type="button" class="iv-ib" data-wre="' + w.id + '" title="Read again">↻</button><button type="button" class="iv-ib" data-wdel="' + w.id + '" title="Remove">🗑</button></span></div></div>';
		}).join("") + "</div>";
	}
	$("iv-wlist").addEventListener("click", function (e) {
		var r = e.target.closest("[data-wre]"); if (r) { refreshWallets(r.dataset.wre); paintWallets(); return; }
		var hd = e.target.closest("[data-whide]"); if (hd) {
			var snap1 = snapshot(), w1 = S.wallets.filter(function (w) { return w.id === hd.dataset.whide; })[0]; if (!w1) return;
			w1.hide = (w1.hide || []).concat([hd.dataset.k]); save(); render();
			toast(assetOf(hd.dataset.k).sym + " hidden on this wallet", function () { restoreSnap(snap1); }); return;
		}
		var uh = e.target.closest("[data-wunhide]"); if (uh) { var w2 = S.wallets.filter(function (w) { return w.id === uh.dataset.wunhide; })[0]; if (w2) { delete w2.hide; save(); render(); } return; }
		var op = e.target.closest("[data-wopen]"); if (op) { var w3 = S.wallets.filter(function (w) { return w.id === op.dataset.wopen; })[0]; if (w3) { w3._open = true; paintWallets(); } return; }
		var d = e.target.closest("[data-wdel]"); if (d) { var snap = snapshot(); S.wallets = S.wallets.filter(function (w) { return w.id !== d.dataset.wdel; }); save(); render(); toast("Wallet removed", function () { restoreSnap(snap); }); }
	});

	/* ---------- charts ---------- */
	function rangeStart() {
		var t = new Date(), first = S.tx.reduce(function (m, x) { return !m || x.d < m ? x.d : m; }, "") || I.today();
		var r = view.range, d = new Date(t);
		if (r === "1m") d.setMonth(d.getMonth() - 1); else if (r === "3m") d.setMonth(d.getMonth() - 3); else if (r === "6m") d.setMonth(d.getMonth() - 6);
		else if (r === "ytd") d = new Date(t.getFullYear(), 0, 1); else if (r === "1y") d.setFullYear(d.getFullYear() - 1); else return first;
		var s = I.today(d); return s < first ? first : s;
	}
	function needHist() {
		var keys = {};
		S.tx.forEach(function (t) { if (t.a[0] === "s" || t.a[0] === "c") keys[t.a] = 1; });
		return Object.keys(keys).filter(function (k) { return !H[k]; });
	}
	var histBusy = false;
	function loadHist() {
		var need = needHist(); if (!need.length || histBusy) return Promise.resolve();
		histBusy = true;
		var i = 0, run = function () {
			if (i >= need.length) return Promise.resolve();
			var k = need[i++], a = assetOf(k);
			return api("h=" + encodeURIComponent(k) + (k[0] === "c" ? "&s=" + encodeURIComponent(a.sym) : "")).then(function (r) { H[k] = r; }).catch(function () { H[k] = { k: k, h: [], err: 1 }; }).then(run);
		};
		return Promise.all([run(), run(), run()]).then(function () { histBusy = false; });
	}
	function paintCharts() {
		root.querySelectorAll("#iv-range button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.r === view.range)); });
		root.querySelectorAll("#iv-alloc button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.g === view.alloc)); });
		paintDonut();
		if (!S.tx.length) { $("iv-line").innerHTML = '<p class="iv-muted iv-pad">Add trades to see how your portfolio grew. (Wallet balances have no history.)</p>'; $("iv-linenote").textContent = ""; return; }
		if (needHist().length) { $("iv-line").innerHTML = '<p class="iv-muted iv-pad">Loading price history…</p>'; loadHist().then(function () { if (view.tab === "chart") paintCharts(); }); return; }
		var from = rangeStart(), to = I.today(), all = I.dateRange(from, to), step = Math.max(1, Math.ceil(all.length / 420));
		var dates = step > 1 ? I.dateRange(from, to, step) : all, hist = {}, pcur = {}, miss = [];
		Object.keys(H).forEach(function (k) { hist[k] = H[k].h; if (H[k].c) pcur[k] = H[k].c; if (H[k].err) miss.push(assetOf(k).sym); });
		var tl = I.timeline(S, hist, P.fx || {}, dates, pcur);
		lineChart($("iv-line"), dates, [{ v: tl.map(function (p) { return p.value; }), name: "Value", cls: "iv-l-val", fill: true }, { v: tl.map(function (p) { return p.invested; }), name: "Money put in", cls: "iv-l-inv", dash: true }]);
		var last = tl[tl.length - 1], firstV = tl.filter(function (p) { return p.value > 0; })[0];
		$("iv-linenote").innerHTML = "Money put in = buys minus what sells brought back. Past prices use today's exchange rate." + (miss.length ? " No price history for: " + esc(miss.join(", ")) + "." : "") + (firstV && view.range !== "all" ? " Change over this range: <b class='" + cls(last.value - firstV.value - (last.invested - firstV.invested)) + "'>" + money(last.value - firstV.value - (last.invested - firstV.invested), { sign: true }) + "</b> (not counting money put in)." : "");
	}
	function lineChart(el, dates, series) {
		var W = Math.max(280, el.clientWidth || 600), Hh = Math.min(300, Math.max(200, Math.round(W * 0.42))), pl = 64, pr = 12, pt = 12, pb = 26;
		var vals = []; series.forEach(function (s) { s.v.forEach(function (x) { if (isFinite(x)) vals.push(x); }); });
		var mn = Math.min(0, Math.min.apply(null, vals)), mx = Math.max.apply(null, vals); if (!(mx > mn)) mx = mn + 1;
		var nice = Math.pow(10, Math.floor(Math.log10((mx - mn) / 4))), stepY = Math.ceil((mx - mn) / 4 / nice) * nice; mx = Math.ceil(mx / stepY) * stepY; mn = Math.floor(mn / stepY) * stepY;
		var X = function (i) { return pl + (W - pl - pr) * (dates.length > 1 ? i / (dates.length - 1) : 0.5); }, Y = function (v) { return pt + (Hh - pt - pb) * (1 - (v - mn) / (mx - mn)); };
		var g = "";
		for (var v = mn; v <= mx + 1e-9; v += stepY) g += '<line class="iv-grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '"/><text class="iv-axis" x="' + (pl - 6) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + esc(short(v)) + "</text>";
		var nx = Math.min(6, dates.length); for (var j = 0; j < nx; j++) { var i = Math.round(j * (dates.length - 1) / Math.max(1, nx - 1)); g += '<text class="iv-axis" x="' + X(i) + '" y="' + (Hh - 6) + '" text-anchor="' + (j === 0 ? "start" : j === nx - 1 ? "end" : "middle") + '">' + esc(dLabel(dates[i], dates)) + "</text>"; }
		series.forEach(function (s) {
			var d = s.v.map(function (x, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(x).toFixed(1); }).join("");
			if (s.fill) g += '<path class="' + s.cls + '-fill" d="' + d + "L" + X(s.v.length - 1) + " " + Y(Math.max(mn, 0)) + "L" + X(0) + " " + Y(Math.max(mn, 0)) + 'Z"/>';
			g += '<path class="' + s.cls + '" fill="none" d="' + d + '"' + (s.dash ? ' stroke-dasharray="5 4"' : "") + "/>";
		});
		g += '<line class="iv-hover" id="iv-hl" x1="0" x2="0" y1="' + pt + '" y2="' + (Hh - pb) + '" visibility="hidden"/>';
		el.innerHTML = '<svg viewBox="0 0 ' + W + " " + Hh + '" width="100%" height="' + Hh + '" role="img" aria-label="Portfolio value over time">' + g + '</svg><div class="iv-tip" hidden></div><div class="iv-legend">' + series.map(function (s) { return '<span><i class="' + s.cls + '-key"></i>' + s.name + "</span>"; }).join("") + "</div>";
		var svg = el.querySelector("svg"), tip = el.querySelector(".iv-tip"), hl = el.querySelector("#iv-hl");
		function move(e) {
			var r = svg.getBoundingClientRect(), x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left, i = Math.round((x * W / r.width - pl) / (W - pl - pr) * (dates.length - 1));
			if (i < 0 || i >= dates.length) return;
			hl.setAttribute("x1", X(i)); hl.setAttribute("x2", X(i)); hl.setAttribute("visibility", "visible");
			tip.hidden = false; tip.innerHTML = "<b>" + new Date(dates[i] + "T12:00:00").toLocaleDateString() + "</b>" + series.map(function (s) { return "<span>" + s.name + ": " + money(s.v[i]) + "</span>"; }).join("");
			var px = X(i) * r.width / W; tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, px - tip.offsetWidth / 2)) + "px";
		}
		svg.addEventListener("mousemove", move); svg.addEventListener("touchmove", move, { passive: true });
		svg.addEventListener("mouseleave", function () { tip.hidden = true; hl.setAttribute("visibility", "hidden"); });
	}
	function short(v) { var a = Math.abs(v), s = S.base === "USD" ? "$" : ""; return (v < 0 ? "-" : "") + s + (a >= 1e9 ? (a / 1e9).toFixed(1) + "B" : a >= 1e6 ? (a / 1e6).toFixed(1) + "M" : a >= 1e3 ? (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + "k" : a.toFixed(0)) + (s ? "" : ""); }
	function dLabel(d, dates) { var dt = new Date(d + "T12:00:00"), span = (new Date(dates[dates.length - 1]) - new Date(dates[0])) / 864e5; return span > 400 ? dt.toLocaleDateString(undefined, { month: "short", year: "numeric" }) : dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
	function paintDonut() {
		var al = I.allocation(lastRes.rows, S, view.alloc), el = $("iv-donut");
		if (!al.length) { el.innerHTML = '<p class="iv-muted iv-pad">Nothing with a price yet.</p>'; return; }
		var top = al.slice(0, 11), rest = al.slice(11).reduce(function (s, x) { return s + x.value; }, 0), tot = al.reduce(function (s, x) { return s + x.value; }, 0);
		if (rest) top.push({ label: "Other", value: rest, w: rest / tot });
		var R = 80, r0 = 52, cx = 100, cy = 100, a0 = -Math.PI / 2, paths = "";
		top.forEach(function (x, i) {
			var a1 = a0 + x.w * Math.PI * 2, big = a1 - a0 > Math.PI ? 1 : 0, c = COL[i % COL.length];
			if (x.w > 0.9999) paths += '<circle cx="' + cx + '" cy="' + cy + '" r="' + ((R + r0) / 2) + '" fill="none" stroke="' + c + '" stroke-width="' + (R - r0) + '"/>';
			else paths += '<path fill="' + c + '" d="M' + (cx + R * Math.cos(a0)) + " " + (cy + R * Math.sin(a0)) + "A" + R + " " + R + " 0 " + big + " 1 " + (cx + R * Math.cos(a1)) + " " + (cy + R * Math.sin(a1)) + "L" + (cx + r0 * Math.cos(a1)) + " " + (cy + r0 * Math.sin(a1)) + "A" + r0 + " " + r0 + " 0 " + big + " 0 " + (cx + r0 * Math.cos(a0)) + " " + (cy + r0 * Math.sin(a0)) + 'Z"><title>' + esc(x.label) + " " + (x.w * 100).toFixed(1) + "%</title></path>";
			a0 = a1;
		});
		el.innerHTML = '<svg viewBox="0 0 200 200" class="iv-donut" role="img" aria-label="Allocation">' + paths + '<text x="100" y="96" text-anchor="middle" class="iv-dc1">' + esc(short(tot)) + '</text><text x="100" y="114" text-anchor="middle" class="iv-dc2">' + esc(S.base) + "</text></svg>" +
			'<ul class="iv-dleg">' + top.map(function (x, i) { return '<li><i style="background:' + COL[i % COL.length] + '"></i><span>' + esc(x.label) + "</span><b>" + (x.w * 100).toFixed(1) + "%</b><small>" + money(x.value) + "</small></li>"; }).join("") + "</ul>";
	}
	$("iv-range").addEventListener("click", function (e) { var b = e.target.closest("[data-r]"); if (b) { view.range = b.dataset.r; paintCharts(); } });
	$("iv-alloc").addEventListener("click", function (e) { var b = e.target.closest("[data-g]"); if (b) { view.alloc = b.dataset.g; paintCharts(); } });
	var rsT; window.addEventListener("resize", function () { clearTimeout(rsT); rsT = setTimeout(function () { if (view.tab === "chart") paintCharts(); }, 200); });

	/* ---------- gains ---------- */
	function paintGains() {
		var years = I.realizedByYear(lastRes.pos), inc = {};
		S.tx.forEach(function (t) { if (t.t === "div") { var y = t.d.slice(0, 4), a = assetOf(t.a), r = t.fx > 0 ? t.fx : I.conv(1, a.cur, S.base, P.fx || {}) || 1; inc[y] = (inc[y] || 0) + t.p * r; } });
		var allY = {}; years.forEach(function (y) { allY[y.y] = 1; }); Object.keys(inc).forEach(function (y) { allY[y] = 1; });
		if (!Object.keys(allY).length) { $("iv-gains").innerHTML = '<p class="iv-muted">No sells or dividends yet.</p>'; return; }
		var byY = {}; years.forEach(function (y) { byY[y.y] = y; });
		$("iv-gains").innerHTML = '<div class="tu-table-wrap"><table class="tu-table iv-table"><thead><tr><th>Year</th><th class="num">Sales</th><th class="num">Proceeds</th><th class="num iv-hm">Cost</th><th class="num">Realized gain</th><th class="num">Dividends &amp; interest</th></tr></thead><tbody>' +
			Object.keys(allY).sort().reverse().map(function (y) {
				var r = byY[y] || { n: 0, proc: 0, cost: 0, gain: 0, rows: [] };
				return '<tr class="iv-yrow" data-y="' + y + '" tabindex="0"><td><b>' + y + "</b>" + (r.n ? " ▸" : "") + '</td><td class="num">' + r.n + '</td><td class="num">' + money(r.proc) + '</td><td class="num iv-hm">' + money(r.cost) + '</td><td class="num ' + cls(r.gain) + '"><b>' + money(r.gain, { sign: true }) + '</b></td><td class="num">' + money(inc[y] || 0) + "</td></tr>" +
					'<tr class="iv-ydet" data-yd="' + y + '" hidden><td colspan="6"><table class="iv-mini"><thead><tr><th>Date</th><th>Asset</th><th class="num">Quantity</th><th class="num">Proceeds</th><th class="num">Cost</th><th class="num">Gain</th></tr></thead><tbody>' +
					r.rows.map(function (x) { return "<tr><td>" + x.d + "</td><td>" + esc(assetOf(x.k).sym) + "</td><td class='num'>" + I.fmtQ(x.q) + "</td><td class='num'>" + money(x.procB) + "</td><td class='num'>" + money(x.costB) + "</td><td class='num " + cls(x.gainB) + "'>" + money(x.gainB, { sign: true }) + "</td></tr>"; }).join("") + "</tbody></table></td></tr>";
			}).join("") + "</tbody></table></div>" +
			'<p><button type="button" class="tu-btn tu-btn--ghost" id="iv-gcsv">⬇ Realized gains as CSV</button></p><p class="tu-note">Method: <b>' + (S.method === "fifo" ? "first in, first out" : "average cost") + "</b>, in " + esc(S.base) + ". Trades without “Rate that day” use today's exchange rate.</p>";
		$("iv-gcsv").onclick = function () {
			var L = ["Date,Asset,Quantity,Proceeds (" + S.base + "),Cost (" + S.base + "),Gain (" + S.base + ")"];
			years.slice().reverse().forEach(function (y) { y.rows.forEach(function (x) { L.push([x.d, assetOf(x.k).sym, x.q, x.procB.toFixed(2), x.costB.toFixed(2), x.gainB.toFixed(2)].join(",")); }); });
			download("realized-gains.csv", L.join("\n"), "text/csv");
		};
	}
	$("iv-gains").addEventListener("click", function (e) { var r = e.target.closest(".iv-yrow"); if (r) { var d = root.querySelector('[data-yd="' + r.dataset.y + '"]'); if (d) d.hidden = !d.hidden; } });

	/* ---------- import & save ---------- */
	function download(name, text, type) { var b = new Blob([text], { type: type || "application/json" }), u = URL.createObjectURL(b), a = document.createElement("a"); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 3000); }
	$("iv-bkp").onclick = function () { download("mes-investments-" + I.today() + ".json", I.backup(S)); };
	$("iv-csvout").onclick = function () { if (!S.tx.length) { toast("No trades yet"); return; } download("trades-" + I.today() + ".csv", I.txCSV(S), "text/csv"); };
	$("iv-rst").onclick = function () { $("iv-rstfile").click(); };
	$("iv-rstfile").onchange = function () {
		var f = this.files[0]; this.value = ""; if (!f) return;
		f.text().then(function (t) {
			var d = I.readBackup(t), snap = snapshot();
			if (S.tx.length && !confirm("Add the trades from this backup to yours?\n\nOK = add (trades you already have are skipped). Cancel = stop.")) return;
			var m = I.merge(S, d); S = m.state; save(); render();
			toast("Added " + m.added + " item" + (m.added === 1 ? "" : "s") + " from the backup", function () { restoreSnap(snap); });
			refreshPrices(true); refreshWallets();
		}).catch(function () { toast("That file is not a backup from this page"); });
	};
	$("iv-wipe").onclick = function () {
		if (!confirm("Delete every trade, asset and wallet on this page?\nYou can undo right after.")) return;
		var snap = snapshot(), base = S.base; S = I.blank(base); save(); render(); toast("Everything deleted", function () { restoreSnap(snap); });
	};
	$("iv-example").onclick = function () { S = I.clean(I.example(S.base)); save(); render(); refreshPrices(); toast("Example portfolio loaded: delete it on the Import & save tab when you are done"); };

	/* CSV import */
	var csv = null;
	$("iv-csvpick").onclick = function () { $("iv-csvfile").click(); };
	$("iv-csvfile").onchange = function () { var f = this.files[0]; this.value = ""; if (f) f.text().then(startCSV); };
	var drop = $("iv-drop");
	["dragover", "dragenter"].forEach(function (ev) { drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("is-over"); }); });
	["dragleave", "drop"].forEach(function (ev) { drop.addEventListener(ev, function () { drop.classList.remove("is-over"); }); });
	drop.addEventListener("drop", function (e) { e.preventDefault(); var f = e.dataTransfer.files[0]; if (f) f.text().then(startCSV); });
	$("iv-csvtext").addEventListener("input", function () { clearTimeout(this._t); var v = this.value; this._t = setTimeout(function () { if (v.trim()) startCSV(v); }, 400); });
	function startCSV(text) {
		var rows = I.parseCSV(text);
		if (rows.length < 2) { $("iv-map").innerHTML = '<p class="iv-qnote is-err">No rows found in that file.</p>'; return; }
		// Some exports put a few title lines first: use the first row with 3+ filled cells that a later row matches in width.
		var hi = 0; for (var i = 0; i < Math.min(10, rows.length - 1); i++) { if (rows[i].filter(Boolean).length >= 3 && Object.keys(I.guessColumns(rows[i])).length >= 2) { hi = i; break; } }
		rows = rows.slice(hi);
		var map = I.guessColumns(rows[0]), head = rows[0].join(" ").toLowerCase();
		csv = { rows: rows, map: map, crypto: /spot|coin|crypto|asset|wallet|staking/.test(head), res: {} };
		paintMap();
	}
	var FIELDS = [["date", "Date"], ["type", "Type (buy / sell…)"], ["sym", "Symbol"], ["q", "Quantity"], ["p", "Price per unit"], ["fee", "Fee"], ["total", "Total amount"], ["note", "Note"]];
	function paintMap() {
		var h = csv.rows[0], opt = function (f) { return '<option value="">—</option>' + h.map(function (c, i) { return '<option value="' + i + '"' + (csv.map[f] === i ? " selected" : "") + ">" + esc(c || "Column " + (i + 1)) + "</option>"; }).join(""); };
		var conv = I.rowsToTx(csv.rows, csv.map, { defType: "buy" }), syms = Object.keys(conv.syms);
		var html = '<h4>1. Check the columns</h4><div class="iv-mapgrid">' + FIELDS.map(function (f) { return '<label>' + f[1] + '<select class="tu-select" data-map="' + f[0] + '">' + opt(f[0]) + "</select></label>"; }).join("") + "</div>" +
			'<p class="tu-note">' + (csv.rows.length - 1) + " rows · " + conv.tx.length + " can be read" + (conv.skipped.length ? " · " + conv.skipped.length + " skipped (" + esc(summSkip(conv.skipped)) + ")" : "") + (csv.map.type == null ? " · no Type column: every row counts as a buy" : "") + "</p>" +
			'<h4>2. What are the symbols?</h4><p class="tu-note">These are mostly <span class="tu-seg"><button type="button" data-cr="0" aria-pressed="' + !csv.crypto + '">Stocks &amp; funds</button><button type="button" data-cr="1" aria-pressed="' + csv.crypto + '">Crypto</button></span></p>' +
			'<div id="iv-symres">' + (syms.length ? '<p class="iv-muted">Looking up ' + syms.length + " symbol" + (syms.length > 1 ? "s" : "") + "…</p>" : "") + "</div>" +
			'<p><button type="button" class="tu-btn tu-btn--primary" id="iv-doimport"' + (conv.tx.length ? "" : " disabled") + ">Import " + conv.tx.length + " trade" + (conv.tx.length === 1 ? "" : "s") + '</button> <button type="button" class="tu-btn tu-btn--ghost" id="iv-csvcancel">Cancel</button></p>';
		$("iv-map").innerHTML = html;
		resolveAll(syms);
	}
	function summSkip(s) { var c = {}; s.forEach(function (x) { c[x.why] = (c[x.why] || 0) + 1; }); return Object.keys(c).map(function (k) { return c[k] + " " + k; }).join(", "); }
	var resSeq = 0;
	function resolveAll(syms) {
		var seq = ++resSeq, i = 0, box = function () { return $("iv-symres"); };
		function one() {
			if (seq !== resSeq || i >= syms.length) return Promise.resolve();
			var s = syms[i++], key = s + "|" + csv.crypto;
			if (csv.res[key]) return one();
			var held = Object.keys(S.assets).filter(function (k) { return S.assets[k].sym.toUpperCase() === s; });
			if (held.length) { csv.res[key] = { pick: held[0], cands: [Object.assign({}, S.assets[held[0]], { ex: "In your portfolio" })] }; return one(); }
			return api("search=" + encodeURIComponent(s)).then(function (r) {
				var ex = r.r.filter(function (x) { return x.sym.toUpperCase() === s; }), other = r.r.filter(function (x) { return x.sym.toUpperCase() !== s; }).slice(0, 4);
				var cr = ex.filter(function (x) { return x.kind === "c"; }), st = ex.filter(function (x) { return x.kind === "s"; });
				var cands = csv.crypto ? cr.concat(st) : st.concat(cr); cands = cands.concat(other);
				csv.res[key] = { pick: cands[0] && (cands[0].sym.toUpperCase() === s || cands[0].sym.toUpperCase().split(".")[0] === s) ? cands[0].k : "m", cands: cands };
			}).catch(function () { csv.res[key] = { pick: "m", cands: [] }; }).then(function () { if (seq === resSeq) paintRes(syms); return one(); });
		}
		return Promise.all([one(), one(), one()]).then(function () { if (seq === resSeq) paintRes(syms); });
	}
	function paintRes(syms) {
		var b = $("iv-symres"); if (!b) return;
		b.innerHTML = '<div class="iv-resgrid">' + syms.map(function (s) {
			var r = csv.res[s + "|" + csv.crypto];
			if (!r) return '<label><b>' + esc(s) + '</b><span class="iv-muted">…</span></label>';
			return '<label><b>' + esc(s) + '</b><select class="tu-select" data-res="' + esc(s) + '">' + r.cands.map(function (c) { return '<option value="' + esc(c.k) + '"' + (r.pick === c.k ? " selected" : "") + ">" + esc(c.sym + " · " + (c.name || "") + (c.ex ? " (" + c.ex + ")" : "")) + "</option>"; }).join("") +
				'<option value="m"' + (r.pick === "m" ? " selected" : "") + '>My own asset (I type the price)</option><option value="skip"' + (r.pick === "skip" ? " selected" : "") + '>Skip these rows</option></select></label>';
		}).join("") + "</div>";
	}
	$("iv-map").addEventListener("change", function (e) {
		var t = e.target;
		if (t.dataset.map) { if (t.value === "") delete csv.map[t.dataset.map]; else csv.map[t.dataset.map] = +t.value; paintMap(); }
		if (t.dataset.res) { var r = csv.res[t.dataset.res + "|" + csv.crypto]; if (r) r.pick = t.value; }
	});
	$("iv-map").addEventListener("click", function (e) {
		var c = e.target.closest("[data-cr]"); if (c) { csv.crypto = c.dataset.cr === "1"; paintMap(); return; }
		if (e.target.id === "iv-csvcancel") { csv = null; $("iv-map").innerHTML = ""; $("iv-csvtext").value = ""; return; }
		if (e.target.id === "iv-doimport") doImport();
	});
	function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
	function doImport() {
		var conv = I.rowsToTx(csv.rows, csv.map, { defType: "buy" }), snap = snapshot(), add = 0, skip = 0, have = {};
		dupSeen = {};
		S.tx.forEach(function (t) { have[t.id] = 1; });
		var manual = {};
		conv.tx.forEach(function (r) {
			var res = csv.res[r.sym + "|" + csv.crypto], pick = res ? res.pick : "m";
			if (pick === "skip") { skip++; return; }
			var k = pick;
			if (pick === "m") { k = manual[r.sym] || Object.keys(S.assets).filter(function (x) { return x[0] === "m" && S.assets[x].sym === r.sym; })[0] || "m:" + I.uid(); manual[r.sym] = k; ensureAsset({ k: k, sym: r.sym, name: r.sym, cur: I.CURRENCIES.indexOf(r.cur) >= 0 ? r.cur : S.base }); }
			else { var c = (res.cands || []).filter(function (x) { return x.k === k; })[0] || { k: k, sym: r.sym, name: r.sym }; ensureAsset({ k: k, sym: c.sym, name: c.name, cur: k[0] === "c" ? "USD" : I.CURRENCIES.indexOf(r.cur) >= 0 ? r.cur : "USD" }); }
			var id = "csv" + hash([r.d, r.t, k, r.q, r.p, r.fee].join("|") + "#" + countDup(r));
			if (have[id]) { skip++; return; }
			have[id] = 1; add++;
			var tx = { id: id, d: r.d, t: r.t, a: k, q: r.q, p: r.p, fee: r.fee || 0 }; if (r.note) tx.note = r.note.slice(0, 200);
			S.tx.push(tx);
		});
		S = I.clean(S); save(); csv = null; $("iv-map").innerHTML = ""; $("iv-csvtext").value = "";
		render(); refreshPrices(true);
		toast("Imported " + add + " trade" + (add === 1 ? "" : "s") + (skip ? ", skipped " + skip + " (already there or skipped)" : ""), function () { restoreSnap(snap); });
		go("tx");
	}
	var dupSeen = {};
	function countDup(r) { var k = [r.d, r.t, r.sym, r.q, r.p].join("|"); dupSeen[k] = (dupSeen[k] || 0) + 1; return dupSeen[k]; }

	/* ---------- cloud (MESCloud, like /ai) ---------- */
	var cdoc = { name: "MES Investments.json" }, cloudSig = null, CKEY = KEY + ":cloud";
	function sig() { return hash(JSON.stringify(S)); }
	function cloudKeep() { try { var l = cdoc.__mcl; if (l) lsSet(CKEY, JSON.stringify({ p: l.p, ref: l.p === "file" ? null : l.ref, name: l.name, ver: l.ver, hid: l.ref && l.ref.__mclId, dir: l.dir })); } catch (e) { /* ignore */ } }
	var cloud = window.MESCloud ? window.MESCloud.attach({
		app: "investments", folder: "MES Apps/Investments", what: "portfolio file", title: "MES Investment Tracker", defExt: "json", btnClass: "tu-btn tu-btn--ghost", mount: $("iv-cloudrow"), replaces: true,
		toast: function (t) { toast(t); },
		exts: [".json"], accept: [{ description: "MES portfolio", accept: { "application/json": [".json"] } }],
		doc: function () { return cdoc; },
		name: function (d) { return d.name || "MES Investments.json"; },
		bytes: function () { return Promise.resolve(new TextEncoder().encode(I.backup(S))); },
		open: function (u8, name) {
			var d = I.readBackup(new TextDecoder().decode(u8)), m = I.merge(S, d);
			S = m.state; save(); cdoc = { name: name }; cloudSig = null;
			setTimeout(function () { render(); refreshPrices(true); refreshWallets(); toast("Opened " + name + (m.added ? ": added " + m.added + " items" : "")); if (cloud) cloud.changed(cdoc); }, 0);
			return cdoc;
		},
		dirty: function () { return cloudSig !== sig(); },
		markDirty: function () { cloudSig = null; },
		saved: function (d, name) { d.name = name; cloudSig = sig(); cloudKeep(); }
	}) : null;
	(function () {
		var k = null; try { k = JSON.parse(lsGet(CKEY, "null")); } catch (e) { /* ignore */ }
		if (!k || !cloud) return;
		function put(ref) { cdoc = { name: k.name, __mcl: { p: k.p, ref: ref, name: k.name, ver: k.ver, at: Date.now(), hid: k.hid || undefined, dir: k.dir } }; cloudSig = sig(); cloud.refresh && cloud.refresh(); }
		if (k.p !== "file") return put(k.ref);
		if (!k.hid || !window.indexedDB) return;
		var q = indexedDB.open("mes-cloud", 1);
		q.onupgradeneeded = function () { q.result.createObjectStore("h"); };
		q.onsuccess = function () { try { var r = q.result.transaction("h").objectStore("h").get(k.hid); r.onsuccess = function () { if (r.result) { r.result.__mclId = k.hid; put(r.result); } }; } catch (e) { /* ignore */ } };
	})();
	if (!cloud) $("iv-cloudrow").innerHTML = '<p class="tu-note">The cloud script did not load. Reload the page to try again.</p>';
	saveHook = function () { if (cloud && cloud.linked && cloud.linked(cdoc)) cloud.changed(cdoc); };

	/* ---------- Hive (MESHive + MESHiveStore, like /fav) ---------- */
	var HAPP = "investments", ENC = KEY + ":hiveenc", hvList = null, hvBusy = false;
	function HV() { return window.MESHive; } function HS() { return window.MESHiveStore; }
	function hmsg(t, c) { var m = $("iv-hv-msg"); m.textContent = t || ""; m.className = "iv-qnote" + (c ? " is-" + c : ""); }
	function hvErr(e) { return e && e.code === "cancel" ? "Cancelled." : (e && e.message) || "Something went wrong."; }
	function paintHvWarn() {
		var w = $("iv-hv-warn"), enc = $("iv-hv-enc").checked;
		if (HS().canEncrypt && !HS().canEncrypt()) { w.className = "iv-hvwarn is-bad"; w.innerHTML = "⚠ Logged in with the Keychain phone app: it can't use your memo key, so pick 🛡 Passphrase under the Encrypt tick, or the save is <b>public</b>."; return; }
		w.className = "iv-hvwarn" + (enc ? "" : " is-bad");
		w.innerHTML = enc ? (HS().lockMode && HS().lockMode() === "pass" ? "🛡 Locked with your passphrase (quantum-safe)." : "🔒 Encrypted with your memo key.") + " Others can see a backup exists and its size, not what's in it. Saved permanently." : "⚠ <b>Public:</b> every trade and amount would be readable by anyone on the Hive blockchain, forever.";
	}
	function paintHvUser() {
		var box = $("iv-hv-user");
		if (!HV() || !HS()) { box.innerHTML = '<p class="tu-note">The Hive scripts did not load. Reload the page to try again.</p>'; return; }
		var u = HV().user();
		if (u) {
			box.innerHTML = '<p>Logged in as <b>@' + esc(u.name) + '</b> <button type="button" class="tu-btn tu-btn--ghost" data-h="logout">Log out</button></p>';
			$("iv-hv-main").hidden = false;
			var ce = $("iv-hv-enc"), can = !HS().canEncrypt || HS().canEncrypt();
			ce.checked = can ? lsGet(ENC, "1") !== "0" : false; ce.disabled = !can; paintHvWarn();
		} else {
			box.innerHTML = '<div class="iv-qrow"><input class="tu-input" id="iv-hv-name" type="text" placeholder="Your Hive username" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="17"><button type="button" class="tu-btn tu-btn--primary" data-h="login">Log in with Keychain</button></div>';
			$("iv-hv-main").hidden = true;
		}
	}
	function hvSet(on) { hvBusy = on; $("iv-hv-save").disabled = on; $("iv-hv-load").disabled = on; }
	function hvLoad(quiet) {
		var u = HV() && HV().user(); if (!u || (hvBusy && !quiet)) return;
		hvSet(true); if (!quiet) hmsg("Looking for your saves on Hive…");
		HS().list(u.name, { app: HAPP, pages: 30 }).then(function (s) {
			hvList = s.filter(function (e) { return e.name === "all"; }).slice(0, 10); paintHvList();
			if (!quiet) hmsg(hvList.length ? "Found " + hvList.length + " save" + (hvList.length > 1 ? "s" : "") + "." : "No saves found on @" + u.name + " yet.");
		}).catch(function (e) { hmsg("Could not read from Hive: " + hvErr(e), "err"); }).then(function () { hvSet(false); });
	}
	function paintHvList() {
		$("iv-hv-list").innerHTML = hvList && hvList.length ? '<ul class="iv-hvl">' + hvList.map(function (e, i) {
			return "<li><span><b>" + esc(new Date(/Z$/.test(e.time) ? e.time : e.time + "Z").toLocaleString()) + "</b> <small>" + esc(HS().lockLabel(e)) + " · " + (e.bytes / 1024).toFixed(1) + " KB" + (e.complete ? "" : " · incomplete") + "</small></span>" +
				(e.complete ? '<button type="button" class="tu-btn tu-btn--primary" data-h="merge" data-i="' + i + '">Add to mine</button><button type="button" class="tu-btn tu-btn--ghost" data-h="replace" data-i="' + i + '">Replace</button>' : "") + "</li>";
		}).join("") + "</ul>" : "";
	}
	if (HV() && HS()) {
		if (HS().encModeUI) HS().encModeUI($("iv-hv-enc"), function () { paintHvUser(); });
		$("iv-hv-enc").onchange = function () { lsSet(ENC, this.checked ? "1" : "0"); paintHvWarn(); };
		$("iv-hv-save").onclick = function () {
			if (hvBusy) return;
			if (!S.tx.length && !S.wallets.length) { hmsg("Nothing to save yet.", "err"); return; }
			var enc = $("iv-hv-enc").checked, u = HV().user();
			if (!enc && !confirm("Save WITHOUT encryption?\n\nEvery trade and amount will be public on the Hive blockchain, forever.")) return;
			hvSet(true);
			HS().save(HAPP, "all", I.clean(S), { encrypt: enc, onProgress: function (m) { hmsg(m); } }).then(function (r) {
				hmsg("Saved to @" + u.name + " on Hive (" + (r.bytes / 1024).toFixed(1) + " KB" + (enc ? ", encrypted" : ", public") + ").", "ok"); hvList = null; setTimeout(function () { hvLoad(true); }, 4000);
			}).catch(function (e) { hmsg(hvErr(e), "err"); }).then(function () { hvSet(false); });
		};
		$("iv-hv-load").onclick = function () { hvLoad(false); };
		$("iv-hive").addEventListener("click", function (e) {
			var b = e.target.closest("[data-h]"); if (!b) return;
			var a = b.dataset.h;
			if (a === "login") {
				var n = ($("iv-hv-name").value || "").trim().replace(/^@/, "");
				if (!n) { $("iv-hv-name").focus(); return; }
				hmsg("Confirm the login in Hive Keychain…");
				HV().login(n).then(function () { hmsg(""); paintHvUser(); hvLoad(true); }).catch(function (x) { hmsg(x.code === "nokeychain" ? "Hive Keychain is not installed in this browser." : hvErr(x), "err"); if (x.code === "nokeychain") $("iv-hv-help").innerHTML = HV().helpHtml(); });
			} else if (a === "logout") { HV().logout(); hvList = null; paintHvList(); paintHvUser(); }
			else if (a === "merge" || a === "replace") {
				var it = hvList[+b.dataset.i]; if (!it || hvBusy) return;
				hvSet(true); hmsg("Opening the save…");
				HS().load(it).then(function (d) {
					var st = I.clean(d), snap = snapshot();
					if (a === "replace") { if (!confirm("Replace your portfolio with this save?")) return; S = st; } else S = I.merge(S, st).state;
					save(); render(); refreshPrices(true); refreshWallets(); hmsg("Loaded.", "ok"); toast("Loaded from Hive", function () { restoreSnap(snap); });
				}).catch(function (x) { hmsg(hvErr(x), "err"); }).then(function () { hvSet(false); });
			}
		});
		HV().onChange && HV().onChange(function () { hvList = null; paintHvList(); paintHvUser(); });
	}
	function paintData() { paintHvUser(); if (HV() && HV().user() && !hvList) hvLoad(true); }

	/* ---------- settings ---------- */
	$("iv-base").innerHTML = I.CURRENCIES.map(function (c) { return "<option>" + c + "</option>"; }).join("");
	$("iv-base").addEventListener("change", function () { S.base = this.value; save(); render(); });
	$("iv-method").addEventListener("change", function () { S.method = this.value; save(); render(); });
	$("iv-reload").addEventListener("click", function () { refreshPrices(); refreshWallets(); });

	/* ---------- start ---------- */
	load();
	$("iv-base").value = S.base; $("iv-method").value = S.method;
	var t0 = lsGet(KEY + ":tab", "hold"); if (/^(hold|tx|wal|chart|gain|data)$/.test(t0)) view.tab = t0;
	if (location.hash === "#wallets") view.tab = "wal"; else if (location.hash === "#import") view.tab = "data";
	render();
	if (!P.at || Date.now() - P.at > 60000) refreshPrices(true);
	if (S.wallets.length) refreshWallets();
	setInterval(function () { if (!document.hidden && Date.now() - (P.at || 0) > 300000) refreshPrices(true); }, 60000);
	paintAgo(); setInterval(paintAgo, 30000);
	window.MESInvDebug = { state: function () { return S; }, prices: function () { return P; }, render: render, go: go };
})();
