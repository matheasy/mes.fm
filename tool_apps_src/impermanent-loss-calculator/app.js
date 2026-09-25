/* MES Impermanent Loss Calculator -- mes.fm/impermanent-loss-calculator
 * 50/50 constant-product pool (x * y = k). You deposit equal dollar values of A and B at the "deposit" prices; the
 * pool then rebalances to the "now / later" prices.
 *   priceRatio r = pB_new / pA_new (k-based): A_lp = sqrt(k r), B_lp = sqrt(k / r)
 *   IL = LPValue - HeldValue,  IL% = IL / HeldValue = 2 sqrt(rho) / (1 + rho) - 1  with rho = (pB_new/pB0) / (pA_new/pA0)
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	function num(id) { var v = parseFloat($(id).value); return isNaN(v) ? NaN : v; }
	function usd(v) { return (v < 0 ? "−$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
	function pct(v, d) { return (v < 0 ? "−" : v > 0 ? "+" : "") + Math.abs(v * 100).toFixed(d === undefined ? 2 : d) + "%"; }
	function amt(v) { return v.toLocaleString("en-US", { maximumFractionDigits: 4 }); }
	function cls(v) { return v < -1e-9 ? "tu-neg" : v > 1e-9 ? "tu-pos" : ""; }
	function ilOf(rho) { return 2 * Math.sqrt(rho) / (1 + rho) - 1; }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

	function compute() {
		var A0 = num("il-aa"), pA0 = num("il-pa"), pA1 = num("il-na"), pB0 = num("il-pb"), pB1 = num("il-nb"), fee = num("il-fee");
		if (!(A0 > 0 && pA0 > 0 && pA1 > 0 && pB0 > 0 && pB1 > 0)) return null;
		if (isNaN(fee) || fee < 0) fee = 0;
		var valA0 = A0 * pA0, B0 = valA0 / pB0, deposit = 2 * valA0, k = A0 * B0;
		var ratio = pB1 / pA1, Alp = Math.sqrt(k * ratio), Blp = Math.sqrt(k / ratio);
		var heldA = A0 * pA1, heldB = B0 * pB1, held = heldA + heldB;
		var lp = Alp * pA1 + Blp * pB1, il = lp - held;
		return { A0: A0, B0: B0, pA0: pA0, pA1: pA1, pB0: pB0, pB1: pB1, valA0: valA0, deposit: deposit, k: k, ratio: ratio, Alp: Alp, Blp: Blp,
			heldA: heldA, heldB: heldB, held: held, lp: lp, il: il, ilPct: il / held, fee: fee / 100,
			holdAOnly: 2 * heldA, holdBOnly: 2 * heldB, rho: (pB1 / pB0) / (pA1 / pA0) };
	}

	function drawChart(c) {
		var svg = $("il-svg"), x0 = 52, x1 = 620, y0 = 18, y1 = 208, ymin = -0.6;
		function X(r) { return x0 + (Math.log10(r) + 1) / 2 * (x1 - x0); }
		function Y(v) { return y0 + (0 - v) / (0 - ymin) * (y1 - y0); }
		var g = "", pts = [], i;
		[0, -0.1, -0.2, -0.3, -0.4, -0.5, -0.6].forEach(function (v) {
			g += '<line class="tu-svg-grid" x1="' + x0 + '" y1="' + Y(v) + '" x2="' + x1 + '" y2="' + Y(v) + '"/><text class="tu-svg-text" x="' + (x0 - 8) + '" y="' + (Y(v) + 4) + '" text-anchor="end">' + (v * 100).toFixed(0) + "%</text>";
		});
		[0.1, 0.25, 0.5, 1, 2, 4, 10].forEach(function (r) {
			g += '<line class="tu-svg-grid" x1="' + X(r) + '" y1="' + y0 + '" x2="' + X(r) + '" y2="' + y1 + '"/><text class="tu-svg-text" x="' + X(r) + '" y="' + (y1 + 18) + '" text-anchor="middle">' + (r < 1 ? "÷" + (1 / r) : r + "×") + "</text>";
		});
		for (i = 0; i <= 120; i++) { var r = Math.pow(10, -1 + 2 * i / 120); pts.push(X(r).toFixed(1) + "," + Y(ilOf(r)).toFixed(1)); }
		g += '<polyline class="il-line" points="' + pts.join(" ") + '"/>';
		var rho = Math.min(10, Math.max(0.1, c.rho));
		g += '<circle class="il-dot" cx="' + X(rho) + '" cy="' + Y(ilOf(rho)) + '" r="7"/>';
		g += '<text class="tu-svg-text" x="' + Math.min(X(rho) + 10, 560) + '" y="' + (Y(ilOf(rho)) - 12) + '">' + pct(ilOf(c.rho), 1) + "</text>";
		g += '<text class="tu-svg-text" x="' + ((x0 + x1) / 2) + '" y="242" text-anchor="middle">price ratio change (B ÷ A, since deposit)</text>';
		svg.innerHTML = g;
	}

	function update() {
		var c = compute();
		var rows = document.querySelectorAll("#il-stats .tu-stat__value");
		if (!c) {
			Array.prototype.forEach.call(rows, function (r) { r.textContent = "—"; });
			$("il-bamt").textContent = "—";
			return;
		}
		var an = $("il-an").value.trim() || "A", bn = $("il-bn").value.trim() || "B";
		$("il-bamt").textContent = amt(c.B0) + " " + bn;
		var pctEl = $("il-pct"); pctEl.textContent = pct(c.ilPct); pctEl.className = "tu-stat__value " + cls(c.ilPct);
		$("il-usd").textContent = usd(c.il) + " compared with holding both tokens";
		$("il-held").textContent = usd(c.held);
		$("il-held-sub").textContent = "Deposit was " + usd(c.deposit) + " (" + pct(c.held / c.deposit - 1) + ").";
		var lpv = c.lp * (1 + c.fee);
		$("il-lp").textContent = usd(lpv);
		$("il-lp-sub").textContent = amt(c.Alp) + " " + an + " + " + amt(c.Blp) + " " + bn + (c.fee ? " (incl. " + (c.fee * 100).toFixed(2) + "% fees)" : "");
		var need = c.held / c.lp - 1;
		$("il-be").textContent = need > 1e-9 ? (need * 100).toFixed(2) + "%" : "None";
		$("il-be-sub").textContent = need > 1e-9 ? "Fees of " + usd(c.held - c.lp) + " (" + (need * 100).toFixed(2) + "% of the pool) make the pool match holding." : "The pool is at or above the value of holding.";
		if (c.fee) {
			var net = lpv - c.held;
			$("il-be-sub").textContent += " Net of your fees: " + usd(net) + " (" + pct(net / c.held) + ").";
		}
		// comparison table
		var strat = [["Hold both tokens", c.held, false], ["Provide liquidity" + (c.fee ? " (with fees)" : ""), lpv, true],
			["Hold only " + an + " (swap at deposit)", c.holdAOnly, false], ["Hold only " + bn + " (swap at deposit)", c.holdBOnly, false]];
		$("il-cmp").querySelector("tbody").innerHTML = strat.map(function (s) {
			var vsDep = s[1] / c.deposit - 1, vsPool = s[1] / lpv - 1;
			return '<tr' + (s[2] ? ' class="is-active"' : "") + "><td>" + esc(s[0]) + "</td><td>" + usd(s[1]) + '</td><td class="' + cls(vsDep) + '">' + pct(vsDep) + '</td><td class="' + (s[2] ? "" : cls(vsPool)) + '">' + (s[2] ? "—" : pct(vsPool)) + "</td></tr>";
		}).join("");
		// scenario table
		$("il-scen").querySelector("tbody").innerHTML = [1.25, 1.5, 2, 3, 4, 5, 10, 20].map(function (r) {
			return "<tr><td>" + r + "× (or ÷" + r + ")</td><td class=\"tu-neg\">" + pct(ilOf(r)) + "</td></tr>";
		}).join("");
		drawChart(c);
		// full calc
		var f = [["Token " + esc(an) + " deposited", amt(c.A0) + " @ " + usd(c.pA0)], ["Token " + esc(bn) + " deposited", amt(c.B0) + " @ " + usd(c.pB0)],
			["Total deposited", usd(c.deposit)], ["Constant product k = A × B", amt(c.k)], ["New prices", esc(an) + " " + usd(c.pA1) + ", " + esc(bn) + " " + usd(c.pB1)],
			["Price ratio B ÷ A (now)", c.ratio.toLocaleString("en-US", { maximumFractionDigits: 6 })], ["Pool holds", amt(c.Alp) + " " + esc(an) + " + " + amt(c.Blp) + " " + esc(bn)],
			["Pool value", usd(c.lp)], ["Value if held", usd(c.held) + " (" + usd(c.heldA) + " " + esc(an) + " + " + usd(c.heldB) + " " + esc(bn) + ")"],
			["Impermanent loss", usd(c.il) + " (" + pct(c.ilPct) + ")"], ["Hold only " + esc(an), usd(c.holdAOnly)], ["Hold only " + esc(bn), usd(c.holdBOnly)]];
		$("il-full").querySelector("tbody").innerHTML = f.map(function (r) { return "<tr><td>" + r[0] + "</td><td>" + r[1] + "</td></tr>"; }).join("");
	}

	function shareUrl() {   // the address bar is never touched while you type; only "Copy link" builds a ?query
		return location.origin + location.pathname + "?" + ["aa", "pa", "na", "pb", "nb", "fee"].map(function (k) { return k + "=" + encodeURIComponent($("il-" + k).value); }).join("&");
	}
	function toast(msg) {
		var t = document.getElementById("tu-toast-x");
		if (!t) { t = document.createElement("div"); t.id = "tu-toast-x"; t.className = "tu-toast"; document.body.appendChild(t); }
		t.textContent = msg; t.classList.add("tu-toast--show");
		clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1300);
	}
	function copyText(text, msg) {
		function done() { toast(msg); }
		function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} document.body.removeChild(ta); }
		if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fb); else fb();
	}

	function init() {
		try { var q = new URLSearchParams(location.search); ["aa", "pa", "na", "pb", "nb", "fee"].forEach(function (k) { if (q.get(k) !== null) $("il-" + k).value = q.get(k); }); } catch (e) {}
		["il-an", "il-aa", "il-pa", "il-na", "il-bn", "il-pb", "il-nb", "il-fee"].forEach(function (id) { $(id).addEventListener("input", update); });
		$("il-presets").addEventListener("click", function (e) {
			var b = e.target.closest("button");
			if (!b) return;
			var pa = num("il-pa"), pb = num("il-pb");
			$("il-na").value = Number((pa * parseFloat(b.getAttribute("data-na"))).toPrecision(8));
			$("il-nb").value = Number((pb * parseFloat(b.getAttribute("data-nb"))).toPrecision(8));
			update();
		});
		$("il-link").addEventListener("click", function () { copyText(shareUrl(), "Link copied"); });
		update();
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
