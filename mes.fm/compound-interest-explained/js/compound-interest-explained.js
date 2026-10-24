/* Compound Interest Explained -- the small maths behind the page's interactive figures (global CIX; require()-able in node:
 * tool_apps_src/compound-interest-explained-tests.js). r = yearly rate as a decimal, n = compounding periods per year (0 = continuous), t = years. */
(function (root) {
	"use strict";
	function simple(P, r, t) { return P * (1 + r * t); }
	function compound(P, r, n, t) { return n === 0 ? P * Math.exp(r * t) : P * Math.exp(n * t * Math.log1p(r / n)); }
	function eApprox(n) { return Math.exp(n * Math.log1p(1 / n)); }            // (1 + 1/n)^n without rounding trouble for huge n
	function apy(r, n) { return n === 0 ? Math.expm1(r) : Math.expm1(n * Math.log1p(r / n)); }
	// future value of N deposits D, growth i per period; due = deposits at the start of each period
	function fvSeries(D, i, N, due) { var s = i === 0 ? D * N : D * Math.expm1(N * Math.log1p(i)) / i; return due ? s * (1 + i) : s; }
	// years for P to grow to A (A > P > 0)
	function timeTo(P, A, r, n) { if (!(A > 0 && P > 0 && r > 0)) return NaN; return Math.log(A / P) / (n === 0 ? r : n * Math.log1p(r / n)); }
	function doubling(r, n) { return timeTo(1, 2, r, n); }
	// rule of thumb estimates; pct = rate in percent
	function rule(k, pct) { return k / pct; }
	function realRate(r, inf) { return (1 + r) / (1 + inf) - 1; }
	// one row per period: {k, start, interest, end}
	function periods(P, r, n, count) {
		var out = [], b = P, g = r / n;
		for (var k = 1; k <= count; k++) { var i = b * g; out.push({ k: k, start: b, interest: i, end: b + i }); b += i; }
		return out;
	}
	var CIX = { simple: simple, compound: compound, eApprox: eApprox, apy: apy, fvSeries: fvSeries, timeTo: timeTo, doubling: doubling, rule: rule, realRate: realRate, periods: periods };
	if (typeof module !== "undefined" && module.exports) module.exports = CIX; else root.CIX = CIX;
})(this);

/* Compound Interest Explained: the article's interactive figures (maths in lib.js = CIX). MathJax is loaded by /main_js/mes-math.js. */
(function () {
	"use strict";
	var root = document.getElementById("ce");
	if (!root || typeof CIX === "undefined") return;
	function $(id) { return document.getElementById(id); }
	function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }
	function num(s) { var v = parseFloat(String(s).replace(/[\s,$€£]/g, "")); return isFinite(v) ? v : NaN; }
	function f2(x) { return x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
	function fx(x, d) { return x.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }); }

	/* equation boxes: shrink each formula to fit (not below 75%), then it scrolls inside its own box */
	(function () {
		var els = Array.prototype.slice.call(root.querySelectorAll(".ce-eq .mes-tex"));
		function fit() {
			els.forEach(function (e) {
				var c = e.querySelector("mjx-container"), box = e.parentNode; if (!c) return;
				e.style.fontSize = "";
				var cs = getComputedStyle(box), avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 2, w = c.getBoundingClientRect().width;
				if (avail > 0 && w > avail) e.style.fontSize = (Math.max(0.75, avail / w) * 100).toFixed(1) + "%";
			});
		}
		if (typeof MutationObserver !== "undefined") els.forEach(function (e) { new MutationObserver(fit).observe(e, { attributes: true, attributeFilter: ["class"] }); });
		var lw = 0;
		if (typeof ResizeObserver !== "undefined") new ResizeObserver(function () { var w = root.clientWidth; if (Math.abs(w - lw) > 4) { lw = w; fit(); } }).observe(root);
		else window.addEventListener("resize", fit);
		var mc = document.getElementById("main-content");   // A- / A+ change the text size without changing the width
		if (mc && typeof MutationObserver !== "undefined") new MutationObserver(function () { setTimeout(fit, 30); }).observe(mc, { attributes: true, attributeFilter: ["style", "class"] });
	})();

	/* 1. period-by-period stepper */
	(function () {
		var count = 0;
		function draw() {
			var P = num($("ce-st-p").value), r = num($("ce-st-r").value) / 100, n = +$("ce-st-n").value, tbl = $("ce-st-table"), sum = $("ce-st-sum"), bars = $("ce-st-bars");
			if (!(P > 0) || !(r >= 0) || r > 1) { tbl.innerHTML = ""; bars.innerHTML = ""; sum.textContent = "Type a starting amount above 0 and a rate between 0% and 100%."; return; }
			var rows = CIX.periods(P, r, n, count), unit = n === 1 ? "Year" : n === 4 ? "Quarter" : "Month", g = 1 + r / n;
			var h = "<thead><tr><th scope=\"col\">" + unit + "</th><th scope=\"col\">Start</th><th scope=\"col\">+ " + fx(r / n * 100, n === 1 ? 2 : 4).replace(/\.?0+$/, "") + "%</th><th scope=\"col\">End</th><th scope=\"col\">Simple</th></tr></thead><tbody>";
			var show = rows.slice(-12);
			if (rows.length > 12) h += "<tr><td colspan=\"5\" class=\"ce-note\">… " + (rows.length - 12) + " earlier rows</td></tr>";
			show.forEach(function (x) { h += "<tr><th scope=\"row\">" + x.k + "</th><td>" + f2(x.start) + "</td><td>" + f2(x.interest) + "</td><td><b>" + f2(x.end) + "</b></td><td>" + f2(CIX.simple(P, r, x.k / n)) + "</td></tr>"; });
			if (!rows.length) h += "<tr><td colspan=\"5\" class=\"ce-note\">Press Next period to pay the first interest.</td></tr>";
			tbl.innerHTML = h + "</tbody>";
			var last = rows.length ? rows[rows.length - 1].end : P, simp = CIX.simple(P, r, count / n), all = rows.slice(-24), mx = Math.max(last, simp) || 1;
			bars.innerHTML = (all.length ? all : [{ k: 0, end: P }]).map(function (x) {
				var s = CIX.simple(P, r, x.k / n);
				return "<span class=\"ce-sb\" title=\"" + unit + " " + x.k + ": " + f2(x.end) + "\"><i class=\"ce-sb__c\" style=\"height:" + (x.end / mx * 100).toFixed(1) + "%\"></i><i class=\"ce-sb__s\" style=\"bottom:" + (s / mx * 100).toFixed(1) + "%\"></i></span>";
			}).join("");
			sum.textContent = count ? "After " + count + " " + unit.toLowerCase() + (count === 1 ? "" : "s") + ": " + f2(last) + " with compounding, " + f2(simp) + " with simple interest (" + f2(last - simp) + " of interest on interest). Each period multiplies by " + fx(g, 6).replace(/\.?0+$/, "") + ", so the formula gives " + f2(P) + " × " + fx(g, 6).replace(/0+$/, "") + "^" + count + " = " + f2(P * Math.pow(g, count)) + "." : "Each period: End = Start × " + fx(g, 6).replace(/\.?0+$/, "") + ". Bars show the compound balance; the orange mark on each bar is where simple interest would be.";
		}
		on($("ce-st-next"), "click", function () { if (count < 600) count++; draw(); });
		on($("ce-st-10"), "click", function () { count = Math.min(600, count + 10); draw(); });
		on($("ce-st-reset"), "click", function () { count = 0; draw(); });
		["ce-st-p", "ce-st-r"].forEach(function (id) { on($(id), "input", draw); });
		on($("ce-st-n"), "change", function () { count = 0; draw(); });
		draw();
	})();

	/* 2. (1 + 1/n)^n -> e */
	(function () {
		var sl = $("ce-e-n"), NS = "http://www.w3.org/2000/svg";
		function nOf(p) { return Math.max(1, Math.round(Math.pow(10, p / 60 * 7.5))); }        // slider 0..60 = n from 1 to ~31.6 million (log scale)
		function pOf(n) { return Math.round(Math.log10(n) / 7.5 * 60); }
		function nName(n) { return n === 1 ? "once" : n === 2 ? "twice" : fx(n, 0) + " times"; }
		var forced = null;
		function el(tag, a, p) { var e = document.createElementNS(NS, tag); for (var k in a) e.setAttribute(k, a[k]); p.appendChild(e); return e; }
		function draw() {
			var n = forced || nOf(+sl.value), v = CIX.eApprox(n), svg = $("ce-e-svg");
			$("ce-e-nv").textContent = nName(n);
			$("ce-e-out").innerHTML = "(1 + 1/" + fx(n, 0) + ")<sup>" + fx(n, 0) + "</sup> = <b>" + v.toFixed(n > 1e5 ? 10 : 6) + "</b> <span class=\"ce-note\">e = 2.7182818285 · short by " + (Math.E - v).toPrecision(3) + "</span>";
			Array.prototype.forEach.call($("ce-e-chips").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-n") === n ? "true" : "false"); });
			while (svg.firstChild) svg.removeChild(svg.firstChild);
			var W = 600, H = 170, L = 44, R = 12, T = 10, B = 26, lo = 2, hi = 2.8;
			function X(lg) { return L + lg / 7.5 * (W - L - R); } function Y(y) { return T + (hi - y) / (hi - lo) * (H - T - B); }
			[2, 2.2, 2.4, 2.6, 2.8].forEach(function (y) { el("line", { x1: L, x2: W - R, y1: Y(y), y2: Y(y), "class": "ce-grid" }, svg); var t = el("text", { x: L - 6, y: Y(y) + 4, "text-anchor": "end", "class": "ce-tx" }, svg); t.textContent = y.toFixed(1); });
			[0, 1, 2, 3, 4, 5, 6, 7].forEach(function (k) { var t = el("text", { x: X(k), y: H - 8, "text-anchor": "middle", "class": "ce-tx" }, svg); t.textContent = k === 0 ? "n=1" : k < 4 ? fx(Math.pow(10, k), 0) : "10^" + k; });
			el("line", { x1: L, x2: W - R, y1: Y(Math.E), y2: Y(Math.E), "class": "ce-eline" }, svg);
			var te = el("text", { x: W - R - 4, y: Y(Math.E) - 5, "text-anchor": "end", "class": "ce-tx ce-tx--e" }, svg); te.textContent = "e ≈ 2.71828";
			var d = ""; for (var s = 0; s <= 150; s++) { var lg = s / 150 * 7.5, nn = Math.pow(10, lg); d += (s ? "L" : "M") + X(lg).toFixed(1) + "," + Y(CIX.eApprox(nn)).toFixed(1); }
			el("path", { d: d, "class": "ce-curve" }, svg);
			el("circle", { cx: X(Math.log10(n)), cy: Y(v), r: 6, "class": "ce-dot" }, svg);
		}
		on(sl, "input", function () { forced = null; draw(); });
		on($("ce-e-chips"), "click", function (e) { var b = e.target.closest("button"); if (!b) return; forced = +b.getAttribute("data-n"); sl.value = Math.min(60, pOf(forced)); draw(); });
		draw();
	})();

	/* 3. rule of 72 vs exact */
	(function () {
		var sl = $("ce-72-r");
		function draw() {
			var R = +sl.value, r = R / 100, ex = CIX.doubling(r, 1);
			$("ce-72-rv").textContent = fx(R, 1).replace(/\.0$/, "") + "%";
			var rows = [["Exact: ln 2 / ln(1 + r)", ex], ["Rule of 72: 72 / " + fx(R, 1).replace(/\.0$/, ""), CIX.rule(72, R)], ["Rule of 70: 70 / " + fx(R, 1).replace(/\.0$/, ""), CIX.rule(70, R)],
				["Rule of 69.3: 69.3 / " + fx(R, 1).replace(/\.0$/, ""), CIX.rule(69.3, R)], ["69.3 / R + 0.35", CIX.rule(69.3, R) + 0.35]];
			var best = 1; rows.forEach(function (x, k) { if (k && Math.abs(x[1] - ex) < Math.abs(rows[best][1] - ex)) best = k; });
			var h = "<thead><tr><th scope=\"col\">Method</th><th scope=\"col\">Years to double</th><th scope=\"col\">Off by</th></tr></thead><tbody>";
			rows.forEach(function (x, k) { var e = (x[1] - ex) * 12; h += "<tr" + (k === best ? " class=\"ce-best\"" : "") + "><th scope=\"row\">" + x[0] + (k === best ? " <span class=\"ce-tag\">closest</span>" : "") + "</th><td>" + x[1].toFixed(2) + "</td><td>" + (k ? (e >= 0 ? "+" : "−") + Math.abs(e).toFixed(1) + " months" : "") + "</td></tr>"; });
			$("ce-72-table").innerHTML = h + "</tbody>";
		}
		on(sl, "input", draw); draw();
	})();
})();
