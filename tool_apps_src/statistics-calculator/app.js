/* MES Statistics Calculator: the page (five tabs) over MESStat (lib.js). */
(function () {
	"use strict";
	var M = window.MESStat, $ = function (id) { return document.getElementById(id); }, root = $("sc"); if (!root || !M) return;
	var KEY = "mes-statistics-calculator:v1";
	var DEF = { tab: "describe", dm: "list", d: "", f: "", col: 0, pop: 0, qm: "ti", dp: 4, dec: "auto", bins: "sturges", bk: "", pv: "90", zv: "",
		r: "", rx: "", rm: "linear", dist: "normal", dq: "lt", dv: {}, test: "t1", tm: "data", alt: "two", alpha: "0.05", tv: {}, sz: "prop", sv: {} };
	var S = JSON.parse(JSON.stringify(DEF));
	function merge(o) { if (!o || typeof o !== "object") return; for (var k in DEF) if (Object.prototype.hasOwnProperty.call(o, k) && o[k] != null && typeof o[k] === typeof DEF[k]) S[k] = o[k]; }
	try { merge(JSON.parse(localStorage.getItem(KEY) || "null")); } catch (e) { /* ignore */ }
	var qp = new URLSearchParams(location.search), fromLink = false;
	if (qp.get("s")) { var dec = M.decode(qp.get("s")); if (dec) { merge(dec); fromLink = true; } }
	if (qp.get("tab")) { S.tab = qp.get("tab"); }
	if (qp.get("d")) { S.d = qp.get("d"); S.dm = "list"; S.tab = "describe"; fromLink = true; }
	if ((fromLink || qp.get("tab")) && history.replaceState) try { history.replaceState(null, "", location.pathname + (qp.get("tab") ? "?tab=" + encodeURIComponent(S.tab) : "") + location.hash); } catch (e) { /* ignore */ }
	var TABS = ["describe", "regress", "dist", "tests", "size"]; if (TABS.indexOf(S.tab) < 0) S.tab = "describe";
	if ([2, 3, 4, 6].indexOf(+S.dp) < 0) S.dp = 4;
	var saveT; function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }, 250); }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function f(x, dp) { return M.fmt(x, dp == null ? +S.dp : dp); }
	function fp(p) { return M.fmtP(p); }
	function pEq(p) { var t = fp(p); return "p " + (/^[<≈]/.test(t) ? t : "= " + t); }
	function pct(x, dp) { return isFinite(x) ? f(100 * x, dp == null ? 2 : dp) + "%" : "–"; }
	function numIn(t) { t = String(t == null ? "" : t).trim(); if (!t) return NaN; return M.toNum(t, /\d,\d/.test(t) && !/\./.test(t) ? "comma" : "dot"); }
	function confIn(t) { var v = numIn(String(t).replace("%", "")); if (!isFinite(v)) return NaN; return v > 1 ? v / 100 : v; }
	var toastT; function toast(m) { var t = $("sc-toast"); t.textContent = m; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2600); }
	function copyText(t, ok) {
		function fb() { var ta = document.createElement("textarea"); ta.value = t; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0;"; document.body.appendChild(ta); ta.select(); var done = false; try { done = document.execCommand("copy"); } catch (e) { /* ignore */ } ta.remove(); toast(done ? ok : "Could not copy: select the text and press Ctrl+C"); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast(ok); }, fb); else fb();
	}
	function setPressed(seg, v) { [].forEach.call($(seg).querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-v") === String(v))); }); }
	function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

	/* ---------- SVG charts ---------- */
	function ticks(lo, hi, n) { if (!(hi > lo)) { hi = lo + 1; } var st = M.niceStep((hi - lo) / (n || 6)), a = Math.ceil(lo / st - 1e-9) * st, out = []; for (var v = a; v <= hi + st * 1e-9 && out.length < 40; v += st) out.push(+v.toPrecision(12)); return out; }
	function tk(v) { return M.fmt(v, 6); }
	function svgOpen(w, h, label) { return '<svg class="sc-svg" viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="' + esc(label) + '" preserveAspectRatio="xMidYMid meet">'; }
	function xAxis(X, lo, hi, y, L, R, n) {
		var s = '<line class="sc-ax" x1="' + L + '" y1="' + y + '" x2="' + R + '" y2="' + y + '"/>';
		ticks(lo, hi, n).forEach(function (v) { var x = X(v); if (x < L - 0.5 || x > R + 0.5) return; s += '<line class="sc-ax" x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y + 5) + '"/><text class="sc-tx" x="' + x + '" y="' + (y + 18) + '" text-anchor="middle">' + esc(tk(v)) + "</text>"; });
		return s;
	}
	function yAxis(Y, lo, hi, L, R, n, intOnly) {
		var s = "", t = ticks(lo, hi, n); if (intOnly) t = t.filter(function (v) { return v === Math.round(v); });
		t.forEach(function (v) { var y = Y(v); s += '<line class="sc-grid" x1="' + L + '" y1="' + y + '" x2="' + R + '" y2="' + y + '"/><text class="sc-tx" x="' + (L - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(tk(v)) + "</text>"; });
		return s;
	}
	function boxSvg(D) {
		var W = 640, H = 140, L = 24, R = 616, lo = D.min, hi = D.max; if (hi === lo) { lo -= 1; hi += 1; } var pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
		var X = function (v) { return (L + (v - lo) / (hi - lo) * (R - L)).toFixed(1); }, cy = 52, bh = 22;
		var s = svgOpen(W, H, "Box plot: minimum " + f(D.min) + ", Q1 " + f(D.q1) + ", median " + f(D.median) + ", Q3 " + f(D.q3) + ", maximum " + f(D.max) + (D.outliers.length ? ", " + D.outliers.length + " outlier(s)" : ""));
		s += '<line class="sc-wh" x1="' + X(D.whiskerLo) + '" y1="' + cy + '" x2="' + X(D.q1) + '" y2="' + cy + '"/><line class="sc-wh" x1="' + X(D.q3) + '" y1="' + cy + '" x2="' + X(D.whiskerHi) + '" y2="' + cy + '"/>';
		s += '<line class="sc-wh" x1="' + X(D.whiskerLo) + '" y1="' + (cy - 12) + '" x2="' + X(D.whiskerLo) + '" y2="' + (cy + 12) + '"/><line class="sc-wh" x1="' + X(D.whiskerHi) + '" y1="' + (cy - 12) + '" x2="' + X(D.whiskerHi) + '" y2="' + (cy + 12) + '"/>';
		s += '<rect class="sc-box" x="' + X(D.q1) + '" y="' + (cy - bh) + '" width="' + Math.max(1, X(D.q3) - X(D.q1)).toFixed(1) + '" height="' + 2 * bh + '" rx="3"><title>Q1 ' + esc(f(D.q1)) + " to Q3 " + esc(f(D.q3)) + " (the middle half)</title></rect>";
		s += '<line class="sc-med" x1="' + X(D.median) + '" y1="' + (cy - bh) + '" x2="' + X(D.median) + '" y2="' + (cy + bh) + '"><title>Median ' + esc(f(D.median)) + "</title></line>";
		var mx = +X(D.mean); s += '<path class="sc-mean" d="M' + mx + " " + (cy - 6) + " l6 6 l-6 6 l-6 -6 z" + '"><title>Mean ' + esc(f(D.mean)) + "</title></path>";
		D.outliers.forEach(function (v) { s += '<circle class="sc-out" cx="' + X(v) + '" cy="' + cy + '" r="5"><title>Outlier ' + esc(f(v)) + "</title></circle>"; });
		s += xAxis(function (v) { return +X(v); }, lo, hi, 100, L, R, 7);
		return s + "</svg>";
	}
	function histSvg(s0, k) {
		var h = M.histogram(s0, k), bins = h.bins, W = 640, H = 260, L = 46, R = 624, T = 14, B = 218;
		var lo = bins[0].lo, hi = bins[bins.length - 1].hi, mc = Math.max.apply(null, bins.map(function (b) { return b.count; }));
		var X = function (v) { return L + (v - lo) / (hi - lo) * (R - L); }, ymax = mc * 1.12 || 1, Y = function (c) { return B - c / ymax * (B - T); };
		var s = svgOpen(W, H, "Histogram with " + bins.length + " bins of width " + f(h.width)) + yAxis(Y, 0, ymax, L, R, 5, true);
		bins.forEach(function (b) {
			var x0 = X(b.lo), x1 = X(b.hi), y = Y(b.count);
			s += '<rect class="sc-bar" x="' + (x0 + 0.5).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(0.5, x1 - x0 - 1).toFixed(1) + '" height="' + (B - y).toFixed(1) + '"><title>' + esc(tk(b.lo)) + " to under " + esc(tk(b.hi)) + ": " + b.count + "</title></rect>";
			if (b.count && bins.length <= 30) s += '<text class="sc-tx sc-tx--s" x="' + ((x0 + x1) / 2).toFixed(1) + '" y="' + (y - 4).toFixed(1) + '" text-anchor="middle">' + b.count + "</text>";
		});
		var every = Math.ceil((bins.length + 1) / 9);
		s += '<line class="sc-ax" x1="' + L + '" y1="' + B + '" x2="' + R + '" y2="' + B + '"/>';
		for (var i = 0; i <= bins.length; i += every) { var v = i < bins.length ? bins[i].lo : bins[bins.length - 1].hi, x = X(v); s += '<line class="sc-ax" x1="' + x.toFixed(1) + '" y1="' + B + '" x2="' + x.toFixed(1) + '" y2="' + (B + 5) + '"/><text class="sc-tx" x="' + x.toFixed(1) + '" y="' + (B + 18) + '" text-anchor="middle">' + esc(tk(v)) + "</text>"; }
		s += '<text class="sc-tx sc-tx--s" x="' + L + '" y="' + (H - 6) + '">Each bar counts the values from its left edge up to (not including) its right edge; the last bar includes its right edge.</text>';
		return { svg: s + "</svg>", h: h };
	}
	function dotSvg(sorted) {
		var W = 640, L = 24, R = 616, lo = sorted[0], hi = sorted[sorted.length - 1]; if (hi === lo) { lo -= 1; hi += 1; } var pad = (hi - lo) * 0.04; lo -= pad; hi += pad;
		var X = function (v) { return L + (v - lo) / (hi - lo) * (R - L); }, groups = [], last = null;
		sorted.forEach(function (v) { var key = +v.toPrecision(10); if (last && last.v === key) last.c++; else { last = { v: key, c: 1 }; groups.push(last); } });
		var maxc = Math.max.apply(null, groups.map(function (g) { return g.c; })), r = maxc > 14 ? Math.max(2, 70 / maxc) : 5, gap = r * 2.2, base = 18 + maxc * gap, H = base + 34;
		var s = svgOpen(W, H, "Dot plot of " + sorted.length + " values");
		groups.forEach(function (g) { for (var i = 0; i < g.c; i++) s += '<circle class="sc-dot" cx="' + X(g.v).toFixed(1) + '" cy="' + (base - r - i * gap).toFixed(1) + '" r="' + r.toFixed(1) + '"><title>' + esc(tk(g.v)) + (g.c > 1 ? " (" + g.c + " times)" : "") + "</title></circle>"; });
		s += xAxis(X, lo, hi, base + 2, L, R, 8);
		return s + "</svg>";
	}
	// a continuous density with shaded regions and marker lines
	function curveSvg(o) {
		var W = 640, H = 250, L = 16, R = 624, T = 14, B = 200, N = 240, lo = o.lo, hi = o.hi, pts = [], ymax = 0;
		for (var i = 0; i <= N; i++) { var x = lo + (hi - lo) * i / N, y = o.pdf(x); if (!isFinite(y)) y = NaN; pts.push([x, y]); if (i > 1 && i < N && y > ymax) ymax = y; }
		if (!(ymax > 0)) ymax = 1; ymax *= 1.1;
		var X = function (v) { return L + (v - lo) / (hi - lo) * (R - L); }, Y = function (y) { return B - Math.min(isNaN(y) ? ymax : y, ymax) / ymax * (B - T); };
		var s = svgOpen(W, H, o.label || "Probability curve");
		(o.regions || []).forEach(function (rg) {
			var a = Math.max(lo, rg[0]), b = Math.min(hi, rg[1]); if (!(b > a)) return;
			var d = "M" + X(a).toFixed(1) + " " + B; for (var j = 0; j <= 80; j++) { var x = a + (b - a) * j / 80; d += " L" + X(x).toFixed(1) + " " + Y(o.pdf(x)).toFixed(1); } d += " L" + X(b).toFixed(1) + " " + B + " Z";
			s += '<path class="sc-shade" d="' + d + '"/>';
		});
		var dd = ""; pts.forEach(function (p, j) { dd += (j ? " L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); });
		s += '<path class="sc-curve" d="' + dd + '"/>';
		(o.marks || []).forEach(function (m) { if (!isFinite(m.x) || m.x < lo || m.x > hi) return; var x = X(m.x).toFixed(1); s += '<line class="sc-mark" x1="' + x + '" y1="' + T + '" x2="' + x + '" y2="' + B + '"/><text class="sc-tx sc-tx--b" x="' + x + '" y="' + (T + 10) + '" text-anchor="' + (m.x > (lo + hi) / 2 ? "end" : "start") + '" dx="' + (m.x > (lo + hi) / 2 ? -4 : 4) + '">' + esc(m.label) + "</text>"; });
		s += xAxis(X, lo, hi, B, L, R, 8);
		return s + "</svg>";
	}
	function barsSvg(o) {   // discrete pmf, k0..k1, sel(k) -> shaded
		var W = 640, H = 250, L = 46, R = 624, T = 14, B = 200, ks = [], ymax = 0;
		for (var k = o.k0; k <= o.k1; k++) { var p = o.pmf(k); ks.push([k, p]); if (p > ymax) ymax = p; }
		ymax = (ymax || 1) * 1.12;
		var n = ks.length, bw = (R - L) / n, X = function (k) { return L + (k - o.k0 + 0.5) * bw; }, Y = function (p) { return B - p / ymax * (B - T); };
		var s = svgOpen(W, H, o.label || "Probability bars") + yAxis(Y, 0, ymax, L, R, 4);
		ks.forEach(function (q) { var y = Y(q[1]); s += '<rect class="' + (o.sel(q[0]) ? "sc-bar" : "sc-bar sc-bar--off") + '" x="' + (X(q[0]) - bw * 0.42).toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + Math.max(0.6, bw * 0.84).toFixed(1) + '" height="' + (B - y).toFixed(1) + '"><title>P(X = ' + q[0] + ") = " + esc(M.fmt(q[1], 6)) + "</title></rect>"; });
		s += '<line class="sc-ax" x1="' + L + '" y1="' + B + '" x2="' + R + '" y2="' + B + '"/>';
		var every = Math.max(1, Math.ceil(n / 16)); ks.forEach(function (q, i) { if (i % every) return; s += '<text class="sc-tx" x="' + X(q[0]).toFixed(1) + '" y="' + (B + 16) + '" text-anchor="middle">' + q[0] + "</text>"; });
		return s + "</svg>";
	}

	/* ---------- tabs ---------- */
	var tabBtns = [].slice.call(root.querySelectorAll(".sc-tabs [role=tab]"));
	function showTab(t, focus) {
		S.tab = t; tabBtns.forEach(function (b) { var on = b.getAttribute("data-tab") === t; b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); });
		TABS.forEach(function (x) { $("sc-p-" + x).hidden = x !== t; });
		save(); renderTab();
	}
	tabBtns.forEach(function (b, i) {
		b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); });
		b.addEventListener("keydown", function (e) { var j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? tabBtns.length - 1 : null; if (j == null) return; e.preventDefault(); j = (j + tabBtns.length) % tabBtns.length; showTab(tabBtns[j].getAttribute("data-tab"), true); });
	});
	function renderTab() { ({ describe: renderDescribe, regress: renderRegress, dist: renderDist, tests: renderTest, size: renderSize })[S.tab](); }

	/* ================= 1. describe ================= */
	var DEX = [
		["Test scores", "72, 85, 90, 66, 85, 78, 92, 88, 59, 85, 74, 81, 95, 70, 85"],
		["2, 4, 4, 4, 5, 5, 7, 9", "2, 4, 4, 4, 5, 5, 7, 9"],
		["Heights (cm)", "162.5\n170.2\n168.0\n175.4\n181.1\n158.9\n172.3\n166.7\n177.8\n169.5\n164.2\n188.0"],
		["With an outlier", "12, 14, 15, 15, 16, 18, 19, 21, 22, 64"],
		["Decimal commas", "3,5; 4,2; 5,1; 4,8; 3,9; 4,4"]
	];
	DEX.forEach(function (e) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.textContent = e[0]; b.addEventListener("click", function () { S.dm = "list"; S.d = e[1]; S.col = 0; syncDescribeInputs(); renderDescribe(); save(); }); $("sc-dex").appendChild(b); });
	var fe = document.createElement("button"); fe.type = "button"; fe.className = "tu-chip"; fe.textContent = "Value, count table"; fe.addEventListener("click", function () { S.dm = "freq"; S.f = "0, 3\n1, 8\n2, 12\n3, 6\n4, 2\n5, 1"; syncDescribeInputs(); renderDescribe(); save(); }); $("sc-dex").appendChild(fe);
	$("sc-qm").innerHTML = Object.keys(M.QMETHODS).map(function (k) { return '<option value="' + k + '">' + esc(M.QMETHODS[k]) + "</option>"; }).join("");
	function syncDescribeInputs() {
		$("sc-d").value = S.d; $("sc-f").value = S.f; $("sc-qm").value = S.qm; $("sc-dp").value = String(S.dp); $("sc-dec").value = S.dec;
		setPressed("sc-dm", S.dm); setPressed("sc-pop", S.pop ? 1 : 0); $("sc-dw").hidden = S.dm !== "list"; $("sc-fw").hidden = S.dm !== "freq";
	}
	var dRender = debounce(function () { renderDescribe(); }, 160);
	$("sc-d").addEventListener("input", function () { S.d = this.value; save(); dRender(); });
	$("sc-f").addEventListener("input", function () { S.f = this.value; save(); dRender(); });
	$("sc-dm").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.dm = b.getAttribute("data-v"); syncDescribeInputs(); save(); renderDescribe(); });
	$("sc-pop").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.pop = +b.getAttribute("data-v"); syncDescribeInputs(); save(); renderDescribe(); });
	$("sc-col").addEventListener("change", function () { S.col = +this.value; save(); renderDescribe(); });
	["qm", "dp", "dec"].forEach(function (k) { $("sc-" + k).addEventListener("change", function () { S[k] = k === "dp" ? +this.value : this.value; save(); renderTab(); }); });
	// static output skeleton (so the look-up boxes keep their focus while the numbers change)
	$("sc-dout").innerHTML =
		'<div id="sc-dempty" class="tu-card sc-empty">Type or paste some numbers above, or pick an example.</div>' +
		'<div id="sc-dres" hidden>' +
		'<div class="tu-stats" id="sc-dtiles"></div>' +
		'<div class="tu-card"><div class="sc-h"><h3>Every statistic</h3><button type="button" class="tu-chip" id="sc-dcopy">Copy as a table</button></div><div class="tu-table-wrap"><table class="tu-table sc-kv" id="sc-dtable"></table></div><p class="tu-note" id="sc-qnote"></p></div>' +
		'<div class="tu-card"><h3>Five-number summary and box plot</h3><div class="tu-table-wrap"><table class="tu-table sc-five" id="sc-dfive"></table></div><div id="sc-dbox" class="sc-chart"></div><p class="tu-note">The box runs from Q1 to Q3 (the middle half of the data), the line inside it is the median and the diamond is the mean. The whiskers reach the smallest and largest values that are not outliers; outliers (more than 1.5 × IQR beyond the box) are drawn as dots.</p></div>' +
		'<div class="tu-card"><div class="sc-h"><h3>Histogram</h3><div class="sc-hctl"><label for="sc-bins" class="tu-label">Bins</label><select id="sc-bins" class="tu-select"></select><label for="sc-bk" class="tu-label">or a number</label><input id="sc-bk" class="tu-input" type="text" inputmode="numeric" placeholder="auto" autocomplete="off"></div></div><div id="sc-dhist" class="sc-chart"></div><p class="tu-note" id="sc-hnote"></p></div>' +
		'<div class="tu-card" id="sc-ddotw"><h3>Dot plot</h3><div id="sc-ddot" class="sc-chart"></div></div>' +
		'<div class="tu-card"><h3>Look up a percentile or a z-score</h3><div class="tu-row"><div class="tu-field tu-field--sm"><label for="sc-pv">Percentile (%)</label><input id="sc-pv" class="tu-input" type="text" inputmode="decimal" autocomplete="off"></div><div class="tu-field tu-field--sm"><label for="sc-zv">A value x</label><input id="sc-zv" class="tu-input" type="text" inputmode="decimal" autocomplete="off" placeholder="e.g. 80"></div></div><div id="sc-dlook" class="sc-look" aria-live="polite"></div></div>' +
		'<details class="tu-card sc-work"><summary>Show the working (mean, variance, standard deviation)</summary><div id="sc-dwork"></div></details>' +
		'<details class="tu-card sc-work"><summary>Sorted data</summary><p id="sc-dsorted" class="sc-sorted"></p></details>' +
		"</div>";
	$("sc-bins").innerHTML = Object.keys(M.BINRULES).map(function (k) { return '<option value="' + k + '">' + M.BINRULES[k] + (k === "sturges" ? " (default)" : "") + "</option>"; }).join("");
	$("sc-bins").value = S.bins; $("sc-bk").value = S.bk; $("sc-pv").value = S.pv; $("sc-zv").value = S.zv;
	$("sc-bins").addEventListener("change", function () { S.bins = this.value; S.bk = ""; $("sc-bk").value = ""; save(); renderDescribe(); });
	$("sc-bk").addEventListener("input", function () { S.bk = this.value; save(); dRender(); });
	$("sc-pv").addEventListener("input", function () { S.pv = this.value; save(); renderLook(); });
	$("sc-zv").addEventListener("input", function () { S.zv = this.value; save(); renderLook(); });
	$("sc-dcopy").addEventListener("click", function () { var rows = [].map.call($("sc-dtable").querySelectorAll("tr"), function (tr) { return [].map.call(tr.children, function (c) { return c.textContent.replace(/−/g, "-"); }).slice(0, 2).join("\t"); }); copyText(rows.join("\n"), "Copied: paste it into a spreadsheet"); });
	var DD = null;
	function readDescribe() {
		var out = { values: [], note: "" };
		$("sc-colw").hidden = true;
		if (S.dm === "freq") {
			var r = M.parseFreq(S.f, S.dec);
			if (r.tooBig) { out.note = "The counts add up to more than 2 million, which is too many for this page."; return out; }
			out.values = r.values; out.note = r.pairs.length ? r.pairs.length + " values with counts, n = " + r.values.length.toLocaleString("en") + (r.bad.length ? ". Skipped " + r.bad.length + " line(s) that were not \"value, whole-number count\": " + r.bad.slice(0, 3).map(function (x) { return "“" + x + "”"; }).join(", ") : "") : "";
			return out;
		}
		if (/\t/.test(S.d)) {
			var c = M.parseColumns(S.d, S.dec);
			if (c.cols.length > 1) {
				$("sc-colw").hidden = false; var col = Math.min(S.col, c.cols.length - 1);
				$("sc-col").innerHTML = c.names.map(function (n, i) { return '<option value="' + i + '">' + esc(n) + " (" + c.cols[i].length + " numbers)</option>"; }).join(""); $("sc-col").value = String(col);
				out.values = c.cols[col]; out.note = "Spreadsheet with " + c.cols.length + " columns: using " + c.names[col] + ", " + out.values.length + " numbers."; return out;
			}
		}
		var p = M.parseNumbers(S.d, S.dec); out.values = p.values;
		if (p.values.length) out.note = p.values.length.toLocaleString("en") + " number" + (p.values.length === 1 ? "" : "s") + " read" + (p.mark === "comma" ? " (decimal commas)" : "") + (p.skipped.length ? ". Skipped " + p.skipped.length + " word(s): " + p.skipped.slice(0, 4).map(function (x) { return "“" + x + "”"; }).join(", ") + (p.skipped.length > 4 ? "…" : "") : ".");
		else if (p.skipped.length) out.note = "No numbers found (skipped: " + p.skipped.slice(0, 4).join(", ") + ").";
		return out;
	}
	function tile(label, val, sub, hero) { return '<div class="tu-stat' + (hero ? " tu-stat--hero" : "") + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value">' + val + "</div>" + (sub ? '<div class="tu-stat__sub">' + sub + "</div>" : "") + "</div>"; }
	function renderDescribe() {
		var r = readDescribe(), a = r.values; $("sc-dnote").textContent = r.note;
		$("sc-dempty").hidden = a.length > 0; $("sc-dres").hidden = !a.length; if (!a.length) { DD = null; return; }
		var D = M.describe(a, { method: S.qm, pop: !!S.pop }); DD = D;
		var pop = !!S.pop, sdName = pop ? "Population SD σ" : "Sample SD s";
		$("sc-dtiles").innerHTML = tile("Mean", f(D.mean), "average: sum ÷ n", true) + tile("Median", f(D.median), "the middle value") + tile(pop ? "Standard deviation σ" : "Standard deviation s", f(D.sd), pop ? "population (÷ n)" : "sample (÷ n − 1)") + tile("Count n", D.n.toLocaleString("en"), "sum " + f(D.sum));
		var mo = D.modes.modes.length ? D.modes.modes.slice(0, 12).map(function (v) { return f(v); }).join(", ") + (D.modes.modes.length > 12 ? "…" : "") + " (" + D.modes.count + " times each)" : D.modes.allSame ? "none (every value occurs " + D.modes.count + " times)" : "none (no value repeats)";
		var rows = [
			["Count n", D.n.toLocaleString("en"), ""], ["Sum Σx", f(D.sum), ""], ["Mean x̄", f(D.mean), "Σx ÷ n"], ["Median", f(D.median), "middle of the sorted list"], ["Mode", mo, "most common value"],
			["Minimum", f(D.min), ""], ["Maximum", f(D.max), ""], ["Range", f(D.range), "max − min"],
			["First quartile Q1", f(D.q1), "25% of the data is below"], ["Third quartile Q3", f(D.q3), "75% of the data is below"], ["Interquartile range IQR", f(D.iqr), "Q3 − Q1"],
			["Outlier fences", f(D.lowerFence) + " and " + f(D.upperFence), "Q1 − 1.5 IQR, Q3 + 1.5 IQR"], ["Outliers", D.outliers.length ? D.outliers.slice(0, 20).map(function (v) { return f(v); }).join(", ") + (D.outliers.length > 20 ? "…" : "") : "none", "1.5 × IQR rule"],
			["Sample variance s²", f(D.varS), "Σ(x − x̄)² ÷ (n − 1)", !pop], ["Population variance σ²", f(D.varP), "Σ(x − x̄)² ÷ n", pop],
			["Sample standard deviation s", f(D.sdS), "√s²", !pop], ["Population standard deviation σ", f(D.sdP), "√σ²", pop],
			["Standard error of the mean", f(D.se), "s ÷ √n"], ["Coefficient of variation", isFinite(D.cv) ? pct(D.cv) : "–", (pop ? "σ" : "s") + " ÷ |mean|"],
			["Skewness", f(pop ? D.skewP : D.skewS), pop ? "population g₁" : "sample, adjusted (Excel SKEW)"], ["Kurtosis (excess)", f(pop ? D.kurtP : D.kurtS), pop ? "population g₂" : "sample, adjusted (Excel KURT); 0 = normal"],
			["Geometric mean", isFinite(D.geo) ? f(D.geo) : "–", isFinite(D.geo) ? "nth root of the product" : "needs every value above 0"], ["Harmonic mean", isFinite(D.harm) ? f(D.harm) : "–", isFinite(D.harm) ? "n ÷ Σ(1/x)" : "needs every value above 0"],
			["Mean absolute deviation", f(D.madMean), "average distance from the mean"], ["Median absolute deviation", f(D.madMedian), "median distance from the median"], ["Root mean square", f(D.rms), "√(Σx² ÷ n)"]
		];
		$("sc-dtable").innerHTML = rows.map(function (q) { return "<tr" + (q[3] ? ' class="is-active"' : "") + "><th scope=\"row\">" + q[0] + "</th><td>" + q[1] + '</td><td class="sc-why">' + q[2] + "</td></tr>"; }).join("");
		$("sc-qnote").innerHTML = "Quartiles: " + esc(M.QMETHODS[S.qm]) + ". Change it under Options. " + (pop ? "Population formulas are highlighted." : "Sample formulas (÷ n − 1) are highlighted; switch to Population at the top if your numbers are the whole group.");
		$("sc-dfive").innerHTML = "<tr><th>Minimum</th><th>Q1</th><th>Median</th><th>Q3</th><th>Maximum</th></tr><tr><td>" + [D.min, D.q1, D.median, D.q3, D.max].map(function (v) { return f(v); }).join("</td><td>") + "</td></tr>";
		$("sc-dbox").innerHTML = boxSvg(D);
		var kIn = parseInt(S.bk, 10), k = kIn > 0 ? Math.min(200, kIn) : M.binCount(D.sorted, S.bins), H = histSvg(D.sorted, k);
		$("sc-dhist").innerHTML = H.svg; $("sc-hnote").textContent = H.h.bins.length + " bins of width " + f(H.h.width) + (kIn > 0 ? " (asked for about " + k + ")." : " (" + M.BINRULES[S.bins] + " suggests " + k + ", rounded to a tidy width).");
		$("sc-ddotw").hidden = D.n > 150; if (D.n <= 150) $("sc-ddot").innerHTML = dotSvg(D.sorted);
		renderLook(); renderWork(a, D);
		var ss = D.sorted.slice(0, 3000).map(function (v) { return f(v); }).join(", "); $("sc-dsorted").textContent = ss + (D.n > 3000 ? " … (" + (D.n - 3000) + " more)" : "");
	}
	function renderLook() {
		var D = DD, el = $("sc-dlook"); if (!D) { el.innerHTML = ""; return; } var h = "";
		var p = numIn(S.pv);
		if (isFinite(p) && p >= 0 && p <= 100) {
			var vi = M.percentile(D.sorted, p / 100, "inc"), ve = p > 0 && p < 100 ? M.percentile(D.sorted, p / 100, "exc") : NaN;
			h += "<p>The <b>" + f(p, 2) + (p === 50 ? " (median)" : "") + "th percentile</b> is <b>" + f(vi) + "</b> (Excel PERCENTILE.INC)" + (isFinite(ve) && Math.abs(ve - vi) > 1e-12 ? ", or " + f(ve) + " by PERCENTILE.EXC" : "") + ".</p>";
		} else if (String(S.pv).trim()) h += '<p class="sc-bad">Type a percentile from 0 to 100.</p>';
		var x = numIn(S.zv);
		if (isFinite(x)) {
			var sd = D.sd, z = (x - D.mean) / sd, pr = M.percentileRank(D.sorted, x);
			h += "<p>For x = <b>" + f(x) + "</b>: z = (x − x̄) ÷ " + (S.pop ? "σ" : "s") + " = (" + f(x) + " − " + f(D.mean) + ") ÷ " + f(sd) + " = <b>" + f(z) + "</b>, so it is " + f(Math.abs(z), 2) + " standard deviations " + (z >= 0 ? "above" : "below") + " the mean. " + f(pr, 2) + "% of your data is below it (percentile rank, ties count half). If the data followed a normal curve, P(X &lt; x) would be " + f(M.normCdf(z), 4) + ".</p>";
		} else if (String(S.zv).trim()) h += '<p class="sc-bad">Type a number for x.</p>';
		el.innerHTML = h;
	}
	function renderWork(a, D) {
		var n = D.n, m = D.mean, pop = !!S.pop, rows, grouped = S.dm === "freq";
		var h = "<ol class=\"sc-steps\"><li>Add the values: Σx = " + f(D.sum) + ".</li><li>Divide by the count: x̄ = Σx ÷ n = " + f(D.sum) + " ÷ " + n + " = <b>" + f(m) + "</b>.</li>" +
			"<li>Subtract the mean from each value and square the result (the table below), then add the squares: Σ(x − x̄)² = " + f(D.ss) + ".</li>" +
			"<li>Variance: " + (pop ? "σ² = Σ(x − x̄)² ÷ n = " + f(D.ss) + " ÷ " + n : "s² = Σ(x − x̄)² ÷ (n − 1) = " + f(D.ss) + " ÷ " + (n - 1)) + " = <b>" + f(D.variance) + "</b>.</li>" +
			"<li>Standard deviation: " + (pop ? "σ" : "s") + " = √" + f(D.variance) + " = <b>" + f(D.sd) + "</b>.</li></ol>";
		if (grouped) {
			var g = M.parseFreq(S.f, S.dec).pairs;
			rows = g.slice(0, 300).map(function (q) { var dv = q[0] - m; return "<tr><td>" + f(q[0]) + "</td><td>" + q[1] + "</td><td>" + f(q[0] * q[1]) + "</td><td>" + f(dv) + "</td><td>" + f(dv * dv) + "</td><td>" + f(q[1] * dv * dv) + "</td></tr>"; });
			h += '<div class="tu-table-wrap"><table class="tu-table"><tr><th>x</th><th>count f</th><th>f·x</th><th>x − x̄</th><th>(x − x̄)²</th><th>f·(x − x̄)²</th></tr>' + rows.join("") + "<tr class=\"is-active\"><td>Total</td><td>" + n + "</td><td>" + f(D.sum) + "</td><td></td><td></td><td>" + f(D.ss) + "</td></tr></table></div>";
			if (g.length > 300) h += '<p class="tu-note">Showing the first 300 of ' + g.length + " rows.</p>";
		} else {
			rows = a.slice(0, 300).map(function (x) { var dv = x - m; return "<tr><td>" + f(x) + "</td><td>" + f(dv) + "</td><td>" + f(dv * dv) + "</td></tr>"; });
			h += '<div class="tu-table-wrap"><table class="tu-table"><tr><th>x</th><th>x − x̄</th><th>(x − x̄)²</th></tr>' + rows.join("") + "<tr class=\"is-active\"><td>Σx = " + f(D.sum) + "</td><td>0</td><td>" + f(D.ss) + "</td></tr></table></div>";
			if (a.length > 300) h += '<p class="tu-note">Showing the first 300 of ' + a.length + " rows; the totals use all of them.</p>";
		}
		$("sc-dwork").innerHTML = h;
	}

	/* ================= 2. regression ================= */
	var REX = [
		["Study hours vs score", "1, 52\n2, 55\n3, 61\n4, 64\n5, 70\n6, 74\n7, 77\n8, 85"],
		["Textbook: 1-5", "1, 2\n2, 4\n3, 5\n4, 4\n5, 5"],
		["Growth (exponential)", "0, 100\n1, 135\n2, 190\n3, 250\n4, 345\n5, 470\n6, 630"],
		["Curved (quadratic)", "-3, 10.2\n-2, 4.9\n-1, 2.1\n0, 1.0\n1, 2.2\n2, 4.8\n3, 10.1"],
		["Temperature vs ice cream", "14.2, 215\n16.4, 325\n11.9, 185\n15.2, 332\n18.5, 406\n22.1, 522\n19.4, 412\n25.1, 614\n23.4, 544\n18.1, 421\n22.6, 445\n17.2, 408"]
	];
	REX.forEach(function (e) { var b = document.createElement("button"); b.type = "button"; b.className = "tu-chip"; b.textContent = e[0]; b.addEventListener("click", function () { S.r = e[1]; $("sc-r").value = S.r; save(); renderRegress(); }); $("sc-rex").appendChild(b); });
	var MODELS = [["linear", "Linear"], ["quadratic", "Quadratic"], ["exponential", "Exponential"], ["power", "Power"], ["logarithmic", "Logarithmic"]];
	$("sc-rout").innerHTML = '<div id="sc-rempty" class="tu-card sc-empty">Type or paste at least 2 x, y pairs above, or pick an example.</div>' +
		'<div id="sc-rres" hidden><div class="tu-stats" id="sc-rtiles"></div><p class="sc-eqn" id="sc-reqn"></p>' +
		'<div class="tu-card"><div class="sc-h"><h3>Scatter plot</h3><div class="tu-seg sc-seg" id="sc-rm" role="group" aria-label="Curve to draw">' + MODELS.map(function (m) { return '<button type="button" data-v="' + m[0] + '" aria-pressed="false">' + m[1] + "</button>"; }).join("") + '</div></div><div id="sc-rchart" class="sc-chart sc-hov"></div><p class="tu-note" id="sc-rhov" aria-live="polite">Point at a dot to read it.</p></div>' +
		'<div class="tu-card"><h3>Predict y for an x</h3><div class="tu-row"><div class="tu-field tu-field--sm"><label for="sc-rx">x</label><input id="sc-rx" class="tu-input" type="text" inputmode="decimal" autocomplete="off" placeholder="e.g. 10"></div></div><div id="sc-rpred" aria-live="polite"></div></div>' +
		'<div class="tu-card"><h3>Linear regression in detail</h3><div class="tu-table-wrap"><table class="tu-table" id="sc-rlin"></table></div><p class="tu-note" id="sc-rlnote"></p></div>' +
		'<div class="tu-card"><h3>Which curve fits best?</h3><div class="tu-table-wrap"><table class="tu-table" id="sc-rfits"></table></div><p class="tu-note">r² here is 1 − SSE ÷ SST on your original y values, so the models can be compared fairly. "r² (TI-84)" is the r² of the straight line fitted to the logarithms, which is what a TI-84 or an Excel trendline reports. Click a row to draw that curve. A higher r² with more parameters (quadratic) is not automatically a better model.</p></div>' +
		'<div class="tu-card"><h3>Correlation</h3><div id="sc-rcor"></div></div>' +
		'<details class="tu-card sc-work"><summary>Residuals (linear)</summary><div id="sc-rres2"></div></details></div>';
	$("sc-r").addEventListener("input", function () { S.r = this.value; save(); rRender(); });
	var rRender = debounce(function () { renderRegress(); }, 160);
	$("sc-rx").addEventListener("input", function () { S.rx = this.value; save(); renderPred(); });
	$("sc-rm").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.rm = b.getAttribute("data-v"); save(); renderRegress(); });
	$("sc-rfits").addEventListener("click", function (e) { var tr = e.target.closest("tr[data-m]"); if (!tr) return; S.rm = tr.getAttribute("data-m"); save(); renderRegress(); });
	$("sc-rfits").addEventListener("keydown", function (e) { if (e.key !== "Enter" && e.key !== " ") return; var tr = e.target.closest("tr[data-m]"); if (!tr) return; e.preventDefault(); S.rm = tr.getAttribute("data-m"); save(); renderRegress(); });
	var RR = null;
	function term(v, s, first) { if (!isFinite(v)) return "?"; var neg = v < 0, t = f(Math.abs(v)); return (first ? (neg ? "−" : "") : (neg ? " − " : " + ")) + t + s; }
	function eqText(m) {
		if (!m || m.error) return "";
		if (m.kind === "linear") return "y = " + term(m.intercept, "", true) + term(m.slope, "x");
		if (m.kind === "quadratic") return "y = " + term(m.a, "x²", true) + term(m.b, "x") + term(m.c, "");
		if (m.kind === "exponential") return "y = " + f(m.a) + " · e^(" + f(m.b) + "x)";
		if (m.kind === "power") return "y = " + f(m.a) + " · x^" + f(m.b);
		return "y = " + term(m.a, "", true) + term(m.b, " · ln x");
	}
	function renderRegress() {
		$("sc-r").value === S.r || ($("sc-r").value = S.r); $("sc-rx").value === S.rx || ($("sc-rx").value = S.rx);
		var P = M.parsePairs(S.r, S.dec), x = P.x, y = P.y, n = x.length;
		$("sc-rnote").textContent = n ? n + " pair" + (n === 1 ? "" : "s") + " read" + (P.rowsMode ? " (first line = x, second line = y)" : "") + (P.skipped ? ", " + P.skipped + " line(s) skipped" : "") + "." : "";
		var L = n >= 2 ? M.linear(x, y) : null;
		if (!L || L.error) { $("sc-rempty").hidden = false; $("sc-rempty").textContent = L && L.error ? L.error : "Type or paste at least 2 x, y pairs above, or pick an example."; $("sc-rres").hidden = true; RR = null; return; }
		$("sc-rempty").hidden = true; $("sc-rres").hidden = false;
		var fits = { linear: L, quadratic: M.quadratic(x, y), exponential: M.exponential(x, y), power: M.power(x, y), logarithmic: M.logarithmic(x, y) };
		if (fits[S.rm] && fits[S.rm].error) S.rm = "linear";
		RR = { x: x, y: y, L: L, fits: fits };
		setPressed("sc-rm", S.rm); [].forEach.call($("sc-rm").querySelectorAll("button"), function (b) { var ft = fits[b.getAttribute("data-v")]; b.disabled = !!(ft && ft.error); b.title = ft && ft.error ? ft.error : ""; });
		$("sc-rtiles").innerHTML = tile("Slope b", f(L.slope), "y changes by this per 1 of x", true) + tile("Intercept a", f(L.intercept), "y when x = 0") + tile("Correlation r", f(L.r), strength(L.r)) + tile("r²", f(L.r2), pct(L.r2, 1) + " of the variation in y explained");
		$("sc-reqn").innerHTML = "Best-fit line: <b>ŷ = " + esc(term(L.intercept, "", true) + term(L.slope, "x")) + "</b>";
		var tc = L.df > 0 ? M.tCrit(0.95, L.df) : NaN;
		$("sc-rlin").innerHTML = "<tr><th></th><th>Estimate</th><th>Std. error</th><th>t</th><th>p-value</th><th>95% CI</th></tr>" +
			"<tr><th scope=\"row\">Slope b</th><td>" + f(L.slope) + "</td><td>" + f(L.seSlope) + "</td><td>" + f(L.tSlope, 3) + "</td><td>" + fp(L.pSlope) + "</td><td>" + (isFinite(tc) ? f(L.ciSlope[0]) + " to " + f(L.ciSlope[1]) : "–") + "</td></tr>" +
			"<tr><th scope=\"row\">Intercept a</th><td>" + f(L.intercept) + "</td><td>" + f(L.seIntercept) + "</td><td>" + f(L.tIntercept, 3) + "</td><td>" + fp(L.pIntercept) + "</td><td>" + (isFinite(tc) ? f(L.ciIntercept[0]) + " to " + f(L.ciIntercept[1]) : "–") + "</td></tr>";
		$("sc-rlnote").innerHTML = L.df > 0 ? "n = " + n + ", degrees of freedom n − 2 = " + L.df + ", residual standard error s = " + f(L.s) + ", SSE = " + f(L.sse) + ". The slope's p-value tests H₀: slope = 0; " + (L.pSlope < 0.05 ? "p &lt; 0.05, so the line's slope is statistically significant at the 5% level." : "p ≥ 0.05, so a slope of 0 (no linear relationship) cannot be ruled out at the 5% level.") : "With only 2 points the line passes through both, so there are no standard errors.";
		$("sc-rfits").innerHTML = "<tr><th>Model</th><th>Equation</th><th>r²</th><th>r² (TI-84)</th></tr>" + MODELS.map(function (m) {
			var ft = fits[m[0]]; if (ft.error) return "<tr><th scope=\"row\">" + m[1] + '</th><td colspan="3" class="sc-why">' + esc(ft.error) + "</td></tr>";
			return '<tr data-m="' + m[0] + '" tabindex="0" class="sc-click' + (m[0] === S.rm ? " is-active" : "") + '"><th scope="row">' + m[1] + "</th><td>" + esc(eqText(ft)) + "</td><td>" + f(ft.r2) + "</td><td>" + (ft.r2t != null ? f(ft.r2t) : "same") + "</td></tr>";
		}).join("");
		var sp = M.spearman(x, y);
		$("sc-rcor").innerHTML = "<p>Pearson r = <b>" + f(L.r) + "</b> (" + strength(L.r) + "), " + pEq(L.pSlope) + ". Spearman's rank correlation ρ = <b>" + f(sp.rho) + "</b>" + (isFinite(sp.p) ? ", " + pEq(sp.p) + " (t approximation)" : "") + ". Spearman uses only the order of the values, so it measures any steadily rising or falling pattern, not just a straight line, and is not thrown by outliers.</p>";
		$("sc-rres2").innerHTML = '<div class="tu-table-wrap"><table class="tu-table"><tr><th>x</th><th>y</th><th>Predicted ŷ</th><th>Residual y − ŷ</th></tr>' + x.slice(0, 500).map(function (v, i) { return "<tr><td>" + f(v) + "</td><td>" + f(y[i]) + "</td><td>" + f(L.fit[i]) + "</td><td>" + f(L.res[i]) + "</td></tr>"; }).join("") + "</table></div>";
		drawScatter(); renderPred();
	}
	function strength(r) { var a = Math.abs(r); if (!isFinite(r)) return ""; return (a >= 0.9 ? "very strong" : a >= 0.7 ? "strong" : a >= 0.4 ? "moderate" : a >= 0.2 ? "weak" : "very weak or none") + (a >= 0.2 ? (r > 0 ? " positive" : " negative") : ""); }
	var SC = null;
	function drawScatter() {
		var x = RR.x, y = RR.y, m = RR.fits[S.rm], W = 640, H = 380, L = 60, R = 624, T = 14, B = 334;
		var xlo = Math.min.apply(null, x), xhi = Math.max.apply(null, x); if (xhi === xlo) { xlo -= 1; xhi += 1; } var px = (xhi - xlo) * 0.06; xlo -= px; xhi += px;
		var curve = []; for (var i = 0; i <= 200; i++) { var cx = xlo + (xhi - xlo) * i / 200; if ((S.rm === "power" || S.rm === "logarithmic") && cx <= 0) continue; var cy = m.predict(cx); if (isFinite(cy)) curve.push([cx, cy]); }
		var ylo = Math.min.apply(null, y), yhi = Math.max.apply(null, y), ys = curve.map(function (p) { return p[1]; }).concat(y);
		var clo = Math.min.apply(null, ys), chi = Math.max.apply(null, ys), span = yhi - ylo || 1; ylo = Math.max(clo, ylo - span * 0.6); yhi = Math.min(chi, yhi + span * 0.6); if (yhi === ylo) { ylo -= 1; yhi += 1; } var py = (yhi - ylo) * 0.06; ylo -= py; yhi += py;
		var X = function (v) { return L + (v - xlo) / (xhi - xlo) * (R - L); }, Y = function (v) { return B - (v - ylo) / (yhi - ylo) * (B - T); };
		var s = svgOpen(W, H, "Scatter plot of " + x.length + " points with the " + S.rm + " fit") + yAxis(Y, ylo, yhi, L, R, 6) + xAxis(X, xlo, xhi, B, L, R, 8);
		s += '<clipPath id="sc-clip"><rect x="' + L + '" y="' + T + '" width="' + (R - L) + '" height="' + (B - T) + '"/></clipPath>';
		var d = ""; curve.forEach(function (p, j) { d += (j ? " L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); });
		s += '<path class="sc-fit" clip-path="url(#sc-clip)" d="' + d + '"/>';
		x.forEach(function (v, j) { s += '<circle class="sc-pt" cx="' + X(v).toFixed(1) + '" cy="' + Y(y[j]).toFixed(1) + '" r="5"><title>(' + esc(tk(v)) + ", " + esc(tk(y[j])) + ")</title></circle>"; });
		s += '<g id="sc-hovg"></g></svg>';
		$("sc-rchart").innerHTML = s; SC = { X: X, Y: Y, L: L, R: R, T: T, B: B };
	}
	$("sc-rchart").addEventListener("mousemove", function (e) {
		if (!RR || !SC) return; var svg = this.querySelector("svg"); if (!svg) return; var rc = svg.getBoundingClientRect(), k = 640 / rc.width, mx = (e.clientX - rc.left) * k, my = (e.clientY - rc.top) * k;
		var best = -1, bd = 1e9; RR.x.forEach(function (v, j) { var dx = SC.X(v) - mx, dy = SC.Y(RR.y[j]) - my, dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = j; } });
		var g = $("sc-hovg"); if (best < 0 || bd > 1600) { g.innerHTML = ""; return; }
		var xv = RR.x[best], yv = RR.y[best], m = RR.fits[S.rm], yh = m.predict(xv), cx = SC.X(xv), cy = SC.Y(yv);
		g.innerHTML = '<line class="sc-mark" x1="' + cx + '" y1="' + SC.T + '" x2="' + cx + '" y2="' + SC.B + '"/><circle class="sc-pt sc-pt--on" cx="' + cx + '" cy="' + cy + '" r="7"/>';
		$("sc-rhov").textContent = "Point " + (best + 1) + ": x = " + f(xv) + ", y = " + f(yv) + ". The " + S.rm + " fit predicts " + f(yh) + ", so the residual is " + f(yv - yh) + ".";
	});
	$("sc-rchart").addEventListener("mouseleave", function () { var g = $("sc-hovg"); if (g) g.innerHTML = ""; });
	function renderPred() {
		var el = $("sc-rpred"); if (!RR) { el.innerHTML = ""; return; } var x0 = numIn(S.rx); if (!isFinite(x0)) { el.innerHTML = String(S.rx).trim() ? '<p class="sc-bad">Type a number for x.</p>' : '<p class="tu-note">Type an x to see the predicted y from every model.</p>'; return; }
		var P = M.linearPredict(RR.L, x0, 0.95), xmin = Math.min.apply(null, RR.x), xmax = Math.max.apply(null, RR.x);
		var h = "<p>Linear: ŷ = <b>" + f(P.y) + "</b>" + (RR.L.df > 0 ? ". 95% confidence interval for the average y at this x: " + f(P.ci[0]) + " to " + f(P.ci[1]) + "; 95% prediction interval for one new point: " + f(P.pi[0]) + " to " + f(P.pi[1]) : "") + ".</p><p class=\"tu-note\">Other models: " +
			MODELS.slice(1).map(function (m) { var ft = RR.fits[m[0]]; if (ft.error) return null; var v = ft.predict(x0); return m[1] + " " + (isFinite(v) ? f(v) : "–"); }).filter(Boolean).join(" · ") + "</p>";
		if (x0 < xmin || x0 > xmax) h += '<p class="sc-warn">This x is outside your data (' + f(xmin) + " to " + f(xmax) + "), so this is extrapolation: the trend may not continue.</p>";
		el.innerHTML = h;
	}

	/* ================= 3. probability distributions ================= */
	var DISTS = {
		normal: { name: "Normal", par: [["mu", "Mean μ", "0"], ["sd", "Standard deviation σ", "1"]], ok: function (p) { return p.sd > 0 ? "" : "σ must be above 0."; },
			pdf: function (x, p) { return M.normPdf(x, p.mu, p.sd); }, cdf: function (x, p) { return M.normCdf(x, p.mu, p.sd); }, inv: function (q, p) { return M.normInv(q, p.mu, p.sd); },
			range: function (p) { return [p.mu - 4 * p.sd, p.mu + 4 * p.sd]; }, mv: function (p) { return [p.mu, p.sd * p.sd]; }, desc: "The bell curve. Heights, measurement errors and many averages follow it." },
		t: { name: "Student's t", par: [["df", "Degrees of freedom ν", "10"]], ok: function (p) { return p.df > 0 ? "" : "Degrees of freedom must be above 0."; },
			pdf: function (x, p) { return M.tPdf(x, p.df); }, cdf: function (x, p) { return M.tCdf(x, p.df); }, inv: function (q, p) { return M.tInv(q, p.df); },
			range: function (p) { var a = Math.min(12, Math.max(4, M.tInv(0.995, p.df))); return [-a, a]; }, mv: function (p) { return [p.df > 1 ? 0 : NaN, p.df > 2 ? p.df / (p.df - 2) : NaN]; }, desc: "Like the normal curve with fatter tails; used for means when σ is estimated from the sample (ν = n − 1)." },
		chi: { name: "Chi-square χ²", par: [["df", "Degrees of freedom k", "5"]], ok: function (p) { return p.df > 0 ? "" : "Degrees of freedom must be above 0."; },
			pdf: function (x, p) { return M.chiPdf(x, p.df); }, cdf: function (x, p) { return M.chiCdf(x, p.df); }, inv: function (q, p) { return M.chiInv(q, p.df); },
			range: function (p) { return [0, M.chiInv(0.999, p.df)]; }, mv: function (p) { return [p.df, 2 * p.df]; }, desc: "Sums of squared normal values; used for goodness-of-fit and independence tests and for variances." },
		F: { name: "F", par: [["d1", "Numerator df d₁", "3"], ["d2", "Denominator df d₂", "20"]], ok: function (p) { return p.d1 > 0 && p.d2 > 0 ? "" : "Both degrees of freedom must be above 0."; },
			pdf: function (x, p) { return M.fPdf(x, p.d1, p.d2); }, cdf: function (x, p) { return M.fCdf(x, p.d1, p.d2); }, inv: function (q, p) { return M.fInv(q, p.d1, p.d2); },
			range: function (p) { return [0, Math.min(50, M.fInv(0.995, p.d1, p.d2))]; }, mv: function (p) { return [p.d2 > 2 ? p.d2 / (p.d2 - 2) : NaN, p.d2 > 4 ? 2 * p.d2 * p.d2 * (p.d1 + p.d2 - 2) / (p.d1 * (p.d2 - 2) * (p.d2 - 2) * (p.d2 - 4)) : NaN]; }, desc: "A ratio of two variances; used in ANOVA and regression F-tests." },
		uniform: { name: "Uniform (continuous)", par: [["a", "From a", "0"], ["b", "To b", "1"]], ok: function (p) { return p.b > p.a ? "" : "b must be bigger than a."; },
			pdf: function (x, p) { return x >= p.a && x <= p.b ? 1 / (p.b - p.a) : 0; }, cdf: function (x, p) { return M.unifCdf(x, p.a, p.b); }, inv: function (q, p) { return p.a + q * (p.b - p.a); },
			range: function (p) { var w = p.b - p.a; return [p.a - 0.15 * w, p.b + 0.15 * w]; }, mv: function (p) { return [(p.a + p.b) / 2, (p.b - p.a) * (p.b - p.a) / 12]; }, desc: "Every value between a and b is equally likely." },
		binomial: { name: "Binomial", disc: true, par: [["n", "Number of trials n", "10"], ["p", "Chance of success p", "0.5"]], ok: function (p) { return p.n >= 0 && p.n === Math.floor(p.n) && p.n <= 1e7 ? (p.p >= 0 && p.p <= 1 ? "" : "p must be between 0 and 1.") : "n must be a whole number (up to 10 million)."; },
			pmf: function (k, p) { return M.binomPmf(k, p.n, p.p); }, cdf: function (k, p) { return M.binomCdf(k, p.n, p.p); },
			support: function (p) { var m = p.n * p.p, s = Math.sqrt(p.n * p.p * (1 - p.p)); return p.n <= 60 ? [0, p.n] : [Math.max(0, Math.floor(m - 5 * s - 2)), Math.min(p.n, Math.ceil(m + 5 * s + 2))]; }, mv: function (p) { return [p.n * p.p, p.n * p.p * (1 - p.p)]; }, desc: "The number of successes in n independent tries, each with the same chance p (coin flips, defective items, free throws)." },
		poisson: { name: "Poisson", disc: true, par: [["lam", "Average count λ", "4"]], ok: function (p) { return p.lam >= 0 && p.lam <= 1e7 ? "" : "λ must be 0 or more."; },
			pmf: function (k, p) { return M.poisPmf(k, p.lam); }, cdf: function (k, p) { return M.poisCdf(k, p.lam); },
			support: function (p) { var s = Math.sqrt(p.lam); return [Math.max(0, Math.floor(p.lam - 5 * s - 2)), Math.ceil(p.lam + 5 * s + 3)]; }, mv: function (p) { return [p.lam, p.lam]; }, desc: "The number of events in a fixed time or space when they happen at a steady average rate λ (calls per hour, typos per page)." },
		geometric: { name: "Geometric", disc: true, par: [["p", "Chance of success p", "0.2"]], ok: function (p) { return p.p > 0 && p.p <= 1 ? "" : "p must be above 0 and at most 1."; },
			pmf: function (k, p) { return M.geomPmf(k, p.p); }, cdf: function (k, p) { return M.geomCdf(k, p.p); },
			support: function (p) { return [1, Math.max(5, Math.min(400, Math.ceil(Math.log(0.001) / Math.log(1 - Math.min(p.p, 0.999)))))]; }, mv: function (p) { return [1 / p.p, (1 - p.p) / (p.p * p.p)]; }, desc: "The trial on which the first success happens (X = 1, 2, 3, …), each try with chance p." }
	};
	var CQ = [["lt", "P(X < x)  (below)"], ["gt", "P(X > x)  (above)"], ["between", "P(a < X < b)  (between)"], ["outside", "P(X < a or X > b)  (outside)"], ["inv", "x for an area to the left (percentile)"], ["invr", "x for an area to the right"], ["invc", "Middle interval for an area"]];
	var DQ = [["eq", "P(X = k)"], ["le", "P(X ≤ k)"], ["lt", "P(X < k)"], ["ge", "P(X ≥ k)"], ["gt", "P(X > k)"], ["between", "P(a ≤ X ≤ b)"]];
	$("sc-dist").innerHTML = Object.keys(DISTS).map(function (k) { return '<option value="' + k + '">' + DISTS[k].name + "</option>"; }).join("");
	function qFields(disc, q) {
		if (disc) return q === "between" ? [["a", "From a", "3"], ["b", "To b", "6"]] : [["k", "k", "4"]];
		if (q === "between" || q === "outside") return [["a", "a", "-1"], ["b", "b", "1"]];
		if (q === "inv" || q === "invr" || q === "invc") return [["p", q === "invc" ? "Middle area (e.g. 0.95)" : "Area (probability)", "0.95"]];
		return [["x", "x", "1.96"]];
	}
	function buildDist() {
		if (!DISTS[S.dist]) S.dist = "normal"; var D = DISTS[S.dist], Q = D.disc ? DQ : CQ;
		if (!Q.some(function (q) { return q[0] === S.dq; })) S.dq = Q[0][0];
		$("sc-dist").value = S.dist; $("sc-dq").innerHTML = Q.map(function (q) { return '<option value="' + q[0] + '">' + esc(q[1]) + "</option>"; }).join(""); $("sc-dq").value = S.dq;
		var fl = D.par.concat(qFields(D.disc, S.dq));
		$("sc-dpar").innerHTML = fl.map(function (p) { var k = S.dist + "." + p[0], v = S.dv[k] != null ? S.dv[k] : p[2]; return '<div class="tu-field tu-field--sm"><label for="sc-dv-' + p[0] + '">' + p[1] + '</label><input id="sc-dv-' + p[0] + '" data-k="' + p[0] + '" class="tu-input" type="text" inputmode="decimal" autocomplete="off" value="' + esc(v) + '"></div>'; }).join("");
		$("sc-ddesc").textContent = D.desc;
	}
	$("sc-dist").addEventListener("change", function () { S.dist = this.value; save(); buildDist(); renderDistOut(); });
	$("sc-dq").addEventListener("change", function () { S.dq = this.value; save(); buildDist(); renderDistOut(); });
	$("sc-dpar").addEventListener("input", function (e) { var k = e.target.getAttribute("data-k"); if (!k) return; S.dv[S.dist + "." + k] = e.target.value; save(); renderDistOut(); });
	function dvals() { var D = DISTS[S.dist], o = {}; D.par.concat(qFields(D.disc, S.dq)).forEach(function (p) { var k = S.dist + "." + p[0]; o[p[0]] = numIn(S.dv[k] != null ? S.dv[k] : p[2]); }); return o; }
	var distBuilt = false;
	function renderDist() { if (!distBuilt) { buildDist(); distBuilt = true; } renderDistOut(); }
	function renderDistOut() {
		var D = DISTS[S.dist], v = dvals(), out = $("sc-pout"), q = S.dq, bad = D.par.filter(function (p) { return !isFinite(v[p[0]]); });
		if (bad.length) { out.innerHTML = '<div class="tu-card sc-empty">Type a number for ' + esc(bad[0][1]) + ".</div>"; return; }
		var err = D.ok(v); if (err) { out.innerHTML = '<div class="tu-card sc-empty">' + esc(err) + "</div>"; return; }
		var mv = D.mv(v), h = "", prob = NaN, label = "", chart = "", extra = "";
		if (!D.disc) {
			var cdf = function (x) { return D.cdf(x, v); }, rg = D.range(v), lo = rg[0], hi = rg[1], regions = [], marks = [];
			if (q === "lt" || q === "gt") {
				if (!isFinite(v.x)) { out.innerHTML = '<div class="tu-card sc-empty">Type a number for x.</div>'; return; }
				prob = q === "lt" ? cdf(v.x) : 1 - cdf(v.x); if (q === "gt" && S.dist === "normal") prob = M.normCdf(-(v.x - v.mu) / v.sd);
				label = "P(X " + (q === "lt" ? "<" : ">") + " " + f(v.x) + ")"; regions = [q === "lt" ? [-1e300, v.x] : [v.x, 1e300]]; marks = [{ x: v.x, label: "x = " + f(v.x) }];
				lo = Math.min(lo, v.x - (hi - lo) * 0.05); hi = Math.max(hi, v.x + (hi - lo) * 0.05);
				if (S.dist === "normal") extra = "<p>z = (x − μ) ÷ σ = (" + f(v.x) + " − " + f(v.mu) + ") ÷ " + f(v.sd) + " = <b>" + f((v.x - v.mu) / v.sd) + "</b>.</p>";
			} else if (q === "between" || q === "outside") {
				if (!isFinite(v.a) || !isFinite(v.b)) { out.innerHTML = '<div class="tu-card sc-empty">Type numbers for a and b.</div>'; return; }
				var a = Math.min(v.a, v.b), b = Math.max(v.a, v.b), mid = cdf(b) - cdf(a); prob = q === "between" ? mid : 1 - mid;
				label = q === "between" ? "P(" + f(a) + " < X < " + f(b) + ")" : "P(X < " + f(a) + " or X > " + f(b) + ")";
				regions = q === "between" ? [[a, b]] : [[-1e300, a], [b, 1e300]]; marks = [{ x: a, label: f(a) }, { x: b, label: f(b) }];
				lo = Math.min(lo, a - (hi - lo) * 0.05); hi = Math.max(hi, b + (hi - lo) * 0.05);
			} else {
				var p = v.p; if (!(p > 0 && p < 1)) { out.innerHTML = '<div class="tu-card sc-empty">Type an area between 0 and 1 (for example 0.95 or 0.025).</div>'; return; }
				if (q === "inv") { var xi = D.inv(p, v); prob = xi; label = "x with P(X < x) = " + f(p, 6); regions = [[-1e300, xi]]; marks = [{ x: xi, label: "x = " + f(xi) }]; }
				else if (q === "invr") { var xr = D.inv(1 - p, v); prob = xr; label = "x with P(X > x) = " + f(p, 6); regions = [[xr, 1e300]]; marks = [{ x: xr, label: "x = " + f(xr) }]; }
				else { var x1 = D.inv((1 - p) / 2, v), x2 = D.inv((1 + p) / 2, v); prob = NaN; label = "Middle " + pct(p, 2); regions = [[x1, x2]]; marks = [{ x: x1, label: f(x1) }, { x: x2, label: f(x2) }];
					extra = "<p>The middle " + pct(p, 2) + " lies between <b>" + f(x1) + "</b> and <b>" + f(x2) + "</b>; " + pct((1 - p) / 2, 3) + " is in each tail." + (S.dist === "normal" && v.mu === 0 && v.sd === 1 ? " These are the critical values ±z* for a " + pct(p, 1) + " confidence interval." : S.dist === "t" ? " These are the critical values ±t* for a " + pct(p, 1) + " confidence interval with " + f(v.df) + " degrees of freedom." : "") + "</p>"; }
			}
			chart = curveSvg({ pdf: function (x) { return D.pdf(x, v); }, lo: Math.max(lo, S.dist === "chi" || S.dist === "F" ? 0 : -1e300), hi: hi, regions: regions, marks: marks, label: D.name + " curve, shaded area = " + label });
			var isInv = q === "inv" || q === "invr";
			h = '<div class="tu-stats">' + (q === "invc" ? tile(esc(label), f(regions[0][0]) + " to " + f(regions[0][1]), "", true) : tile(esc(label), f(prob, isInv ? Math.max(6, +S.dp) : Math.max(7, +S.dp)), isInv ? "" : pct(prob, 2) + (prob > 0 && prob < 1e-4 ? " (" + prob.toExponential(3) + ")" : ""), true)) +
				tile("Mean", f(mv[0]), "") + tile("Standard deviation", f(Math.sqrt(mv[1])), "variance " + f(mv[1])) + "</div>";
			out.innerHTML = h + '<div class="tu-card">' + extra + '<div class="sc-chart">' + chart + "</div></div>";
			return;
		}
		// discrete
		var sp = D.support(v), k0 = sp[0], k1 = sp[1], cdfD = function (k) { return D.cdf(k, v); }, pmf = function (k) { return D.pmf(k, v); }, sel;
		var k = v.k, a2 = Math.round(Math.min(v.a, v.b)), b2 = Math.round(Math.max(v.a, v.b));
		if (q === "between") { if (!isFinite(v.a) || !isFinite(v.b)) { out.innerHTML = '<div class="tu-card sc-empty">Type whole numbers for a and b.</div>'; return; } prob = cdfD(b2) - cdfD(a2 - 1); label = "P(" + a2 + " ≤ X ≤ " + b2 + ")"; sel = function (j) { return j >= a2 && j <= b2; }; k0 = Math.min(k0, a2); k1 = Math.max(k1, b2); }
		else {
			if (!isFinite(k)) { out.innerHTML = '<div class="tu-card sc-empty">Type a whole number for k.</div>'; return; } k = Math.round(k);
			if (q === "eq") { prob = pmf(k); sel = function (j) { return j === k; }; } else if (q === "le") { prob = cdfD(k); sel = function (j) { return j <= k; }; }
			else if (q === "lt") { prob = cdfD(k - 1); sel = function (j) { return j < k; }; } else if (q === "ge") { prob = 1 - cdfD(k - 1); sel = function (j) { return j >= k; }; }
			else { prob = 1 - cdfD(k); sel = function (j) { return j > k; }; }
			label = "P(X " + { eq: "=", le: "≤", lt: "<", ge: "≥", gt: ">" }[q] + " " + k + ")"; k0 = Math.max(S.dist === "geometric" ? 1 : 0, Math.min(k0, k - 2)); k1 = Math.max(k1, k + 2); if (S.dist === "binomial") k1 = Math.min(k1, v.n);
		}
		if (k1 - k0 > 400) { var c = Math.round((k0 + k1) / 2); k0 = Math.max(k0, c - 200); k1 = k0 + 400; }
		chart = barsSvg({ pmf: pmf, k0: k0, k1: k1, sel: sel, label: D.name + " probabilities, highlighted bars = " + label });
		h = '<div class="tu-stats">' + tile(esc(label), f(prob, Math.max(7, +S.dp)), pct(prob, 2) + (prob > 0 && prob < 1e-4 ? " (" + prob.toExponential(3) + ")" : ""), true) + tile("Mean", f(mv[0]), "expected value") + tile("Standard deviation", f(Math.sqrt(mv[1])), "variance " + f(mv[1])) + "</div>";
		if (S.dist === "binomial" && q === "eq") extra = "<p>P(X = k) = C(n, k) · p^k · (1 − p)^(n − k) = C(" + v.n + ", " + k + ") · " + f(v.p) + "^" + k + " · " + f(1 - v.p) + "^" + (v.n - k) + " = <b>" + f(prob, 6) + "</b>.</p>";
		if (S.dist === "poisson" && q === "eq") extra = "<p>P(X = k) = λ^k · e^(−λ) ÷ k! = " + f(v.lam) + "^" + k + " · e^(−" + f(v.lam) + ") ÷ " + k + "! = <b>" + f(prob, 6) + "</b>.</p>";
		var rows = []; for (var j = k0; j <= Math.min(k1, k0 + 300); j++) rows.push("<tr" + (sel(j) ? ' class="is-active"' : "") + "><td>" + j + "</td><td>" + M.fmt(pmf(j), 6) + "</td><td>" + M.fmt(cdfD(j), 6) + "</td><td>" + M.fmt(1 - cdfD(j - 1), 6) + "</td></tr>");
		out.innerHTML = h + '<div class="tu-card">' + extra + '<div class="sc-chart">' + chart + '</div></div><details class="tu-card sc-work"><summary>Table of probabilities (' + k0 + " to " + Math.min(k1, k0 + 300) + ')</summary><div class="tu-table-wrap"><table class="tu-table"><tr><th>k</th><th>P(X = k)</th><th>P(X ≤ k)</th><th>P(X ≥ k)</th></tr>' + rows.join("") + "</table></div></details>";
	}

	/* ================= 4. hypothesis tests ================= */
	var A = "area";
	var TESTS = {
		z1: { name: "One-sample z-test for a mean (σ known)", modes: 1, data: [["x", "Data", A]], sum: [["m", "Sample mean x̄"], ["n", "Sample size n"]], common: [["sigma", "Population SD σ"], ["mu0", "Hypothesised mean μ₀"]],
			ex: { x: "103 98 110 105 97 101 108 99 104 103 107 100", m: "103", n: "36", sigma: "6", mu0: "100" }, desc: "Is the mean different from a value, when the population standard deviation σ is known? (Rare in practice: if σ is estimated from the data, use the t-test.)" },
		t1: { name: "One-sample t-test / confidence interval for a mean", modes: 1, data: [["x", "Data", A]], sum: [["m", "Sample mean x̄"], ["s", "Sample SD s"], ["n", "Sample size n"]], common: [["mu0", "Hypothesised mean μ₀"]],
			ex: { x: "5.1 4.9 5.6 5.8 6.0 5.3 5.7 5.2", m: "5.45", s: "0.39", n: "8", mu0: "5" }, desc: "Is the mean different from a value? Also gives the confidence interval for the mean." },
		welch: { name: "Two-sample t-test (Welch, unequal variances)", modes: 1, data: [["a", "Group 1 data", A], ["b", "Group 2 data", A]], sum: [["m1", "Group 1 mean"], ["s1", "Group 1 SD"], ["n1", "Group 1 n"], ["m2", "Group 2 mean"], ["s2", "Group 2 SD"], ["n2", "Group 2 n"]], common: [["d0", "Hypothesised difference μ₁ − μ₂", "0"]],
			ex: { a: "85 90 78 92 88 76 95 89", b: "80 75 83 70 78 82 74", m1: "86.6", s1: "6.5", n1: "8", m2: "77.4", s2: "4.6", n2: "7", d0: "0" }, desc: "Do two independent groups have different means? Welch's version does not assume the groups have the same spread (the safer default)." },
		pooled: { name: "Two-sample t-test (pooled, equal variances)", modes: 1, data: [["a", "Group 1 data", A], ["b", "Group 2 data", A]], sum: [["m1", "Group 1 mean"], ["s1", "Group 1 SD"], ["n1", "Group 1 n"], ["m2", "Group 2 mean"], ["s2", "Group 2 SD"], ["n2", "Group 2 n"]], common: [["d0", "Hypothesised difference μ₁ − μ₂", "0"]],
			ex: { a: "85 90 78 92 88 76 95 89", b: "80 75 83 70 78 82 74", m1: "86.6", s1: "6.5", n1: "8", m2: "77.4", s2: "4.6", n2: "7", d0: "0" }, desc: "Do two independent groups have different means, assuming both have the same variance?" },
		paired: { name: "Paired t-test (before and after)", data: [["a", "First measurement (one per line or space)", A], ["b", "Second measurement, same order", A]], common: [["d0", "Hypothesised mean difference", "0"]],
			ex: { a: "72 68 80 75 66 70 78 74", b: "70 65 76 74 63 69 72 71", d0: "0" }, desc: "Two measurements on the same people or items (before and after, left and right). It tests the mean of the differences, first − second." },
		prop1: { name: "One-proportion z-test", common: [["x", "Successes x"], ["n", "Sample size n"], ["p0", "Hypothesised proportion p₀"]], ex: { x: "58", n: "100", p0: "0.5" }, desc: "Is a proportion different from a value? For example 58 heads in 100 flips of a coin." },
		prop2: { name: "Two-proportion z-test", common: [["x1", "Group 1 successes"], ["n1", "Group 1 n"], ["x2", "Group 2 successes"], ["n2", "Group 2 n"]], ex: { x1: "45", n1: "100", x2: "30", n2: "100" }, desc: "Do two groups have different proportions? For example click rates of two versions of a page (A/B test)." },
		gof: { name: "Chi-square goodness of fit", noalt: 1, common: [["obs", "Observed counts", A], ["exp", "Expected counts or proportions (blank = all equal)", A]], ex: { obs: "18 22 16 25 19 20", exp: "" }, desc: "Do counts in categories match the proportions you expect? For example, is a die fair?" },
		indep: { name: "Chi-square test of independence (table)", noalt: 1, common: [["tab", "Table of counts (one row per line; paste from a spreadsheet)", A]], ex: { tab: "\tYes\tNo\nMen\t30\t20\nWomen\t15\t35" }, desc: "Are two categorical variables related? Paste a table of counts; header rows and labels are skipped." },
		anova: { name: "One-way ANOVA", noalt: 1, common: [["g", "Groups: one group per line (or spreadsheet columns)", A]], ex: { g: "4.2 4.8 5.1 4.6 4.9\n5.6 6.1 5.8 6.4 5.9\n4.9 5.2 5.5 5.0 5.3" }, desc: "Do three or more groups have different means? It tests all of them at once." }
	};
	$("sc-test").innerHTML = Object.keys(TESTS).map(function (k) { return '<option value="' + k + '">' + TESTS[k].name + "</option>"; }).join("");
	function testFields() { var T = TESTS[S.test]; return (T.modes ? (S.tm === "sum" ? T.sum : T.data) : T.data || []).concat(T.common || []); }
	function tget(id, def) { var o = S.tv[S.test] || {}; return o[id] != null ? o[id] : def != null ? def : ""; }
	function buildTest() {
		if (!TESTS[S.test]) S.test = "t1"; var T = TESTS[S.test]; if (!S.tv[S.test]) S.tv[S.test] = JSON.parse(JSON.stringify(T.ex));
		$("sc-test").value = S.test; $("sc-alt").value = S.alt; $("sc-alpha").value = S.alpha; $("sc-altw").hidden = !!T.noalt; $("sc-tmw").hidden = !T.modes; setPressed("sc-tm", S.tm);
		$("sc-tdesc").textContent = T.desc;
		$("sc-tpar").innerHTML = testFields().map(function (p) {
			var v = tget(p[0], p[2] !== A ? p[2] : ""), area = p[2] === A;
			return '<div class="tu-field' + (area ? " sc-wide" : " tu-field--sm") + '"><label for="sc-tv-' + p[0] + '">' + p[1] + "</label>" + (area ? '<textarea id="sc-tv-' + p[0] + '" data-k="' + p[0] + '" class="tu-input sc-ta" rows="' + (S.test === "indep" || S.test === "anova" ? 4 : 2) + '" spellcheck="false" autocomplete="off">' + esc(v) + "</textarea>" : '<input id="sc-tv-' + p[0] + '" data-k="' + p[0] + '" class="tu-input" type="text" inputmode="decimal" autocomplete="off" value="' + esc(v) + '">') + "</div>";
		}).join("");
	}
	$("sc-test").addEventListener("change", function () { S.test = this.value; save(); buildTest(); renderTestOut(); });
	$("sc-alt").addEventListener("change", function () { S.alt = this.value; save(); renderTestOut(); });
	$("sc-alpha").addEventListener("change", function () { S.alpha = this.value; save(); renderTestOut(); });
	$("sc-tm").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.tm = b.getAttribute("data-v"); save(); buildTest(); renderTestOut(); });
	var tRender = debounce(function () { renderTestOut(); }, 160);
	$("sc-tpar").addEventListener("input", function (e) { var k = e.target.getAttribute("data-k"); if (!k) return; S.tv[S.test] = S.tv[S.test] || {}; S.tv[S.test][k] = e.target.value; save(); tRender(); });
	$("sc-tex").addEventListener("click", function () { S.tv[S.test] = JSON.parse(JSON.stringify(TESTS[S.test].ex)); save(); buildTest(); renderTestOut(); });
	function list(id) { return M.parseNumbers(tget(id), "auto").values; }
	function num(id) { return numIn(tget(id, (testFields().filter(function (p) { return p[0] === id; })[0] || [])[2])); }
	var ALTW = { two: "different from", less: "less than", greater: "greater than" }, ALTS = { two: "≠", less: "<", greater: ">" };
	function runTest() {
		var t = S.test, alt = S.alt, conf = 1 - +S.alpha, T = TESTS[t], sumMode = T.modes && S.tm === "sum", r, need = function (v, what) { if (!isFinite(v)) throw new Error("Type a number for " + what + "."); return v; };
		if (t === "z1" || t === "t1") {
			var d = sumMode ? { n: need(num("n"), "n"), mean: need(num("m"), "the sample mean"), sd: t === "t1" ? need(num("s"), "the sample SD") : NaN } : { values: list("x") };
			if (!sumMode && d.values.length < 2) throw new Error("Type at least 2 data values.");
			if (sumMode && !(d.n >= 2)) throw new Error("n must be at least 2.");
			var mu0 = need(num("mu0"), "μ₀");
			if (t === "z1") { var sg = need(num("sigma"), "σ"); if (!(sg > 0)) throw new Error("σ must be above 0."); r = M.zTest1(d, mu0, sg, alt, conf); }
			else { r = M.tTest1(d, mu0, alt, conf); if (!(r.sd > 0)) throw new Error("The standard deviation is 0, so a t-test is not possible (every value is the same)."); }
			r.h0 = "μ = " + f(mu0); r.h1 = "μ " + ALTS[alt] + " " + f(mu0); r.claim = "the population mean is " + ALTW[alt] + " " + f(mu0);
			r.ciName = "the mean μ"; r.info = [["Sample mean x̄", f(r.mean)], ["n", r.n], [t === "z1" ? "σ (given)" : "Sample SD s", f(t === "z1" ? num("sigma") : r.sd)], ["Standard error", f(r.se)]];
			if (t === "t1") r.info.push(["Effect size (Cohen's d)", f(r.d, 3)]);
		} else if (t === "welch" || t === "pooled") {
			var d1 = sumMode ? { n: need(num("n1"), "group 1 n"), mean: need(num("m1"), "group 1 mean"), sd: need(num("s1"), "group 1 SD") } : { values: list("a") };
			var d2 = sumMode ? { n: need(num("n2"), "group 2 n"), mean: need(num("m2"), "group 2 mean"), sd: need(num("s2"), "group 2 SD") } : { values: list("b") };
			if (!sumMode && (d1.values.length < 2 || d2.values.length < 2)) throw new Error("Each group needs at least 2 values.");
			var d0 = num("d0"); if (!isFinite(d0)) d0 = 0;
			r = M.tTest2(d1, d2, alt, conf, t === "pooled", d0); if (!(r.se > 0)) throw new Error("Both groups have no spread, so a t-test is not possible.");
			r.h0 = "μ₁ − μ₂ = " + f(d0); r.h1 = "μ₁ − μ₂ " + ALTS[alt] + " " + f(d0); r.claim = d0 === 0 ? "the mean of group 1 is " + ALTW[alt] + " the mean of group 2" : "the difference in means is " + ALTW[alt] + " " + f(d0);
			r.ciName = "the difference μ₁ − μ₂"; r.info = [["Group 1: mean, SD, n", f(r.a.mean) + ", " + f(r.a.sd) + ", " + r.a.n], ["Group 2: mean, SD, n", f(r.b.mean) + ", " + f(r.b.sd) + ", " + r.b.n], ["Difference of means", f(r.est)], ["Standard error", f(r.se)], ["Effect size (Cohen's d)", f(r.d, 3)]];
		} else if (t === "paired") {
			var xa = list("a"), xb = list("b"); if (xa.length < 2) throw new Error("Type at least 2 pairs."); var dd0 = num("d0"); if (!isFinite(dd0)) dd0 = 0;
			r = M.tTestPaired(xa, xb, alt, conf, dd0); if (r.error) throw new Error(r.error + " (now " + xa.length + " and " + xb.length + ")"); if (!(r.sd > 0)) throw new Error("Every difference is the same, so a t-test is not possible.");
			r.h0 = "μ_d = " + f(dd0); r.h1 = "μ_d " + ALTS[alt] + " " + f(dd0); r.claim = "the mean difference (first − second) is " + ALTW[alt] + " " + f(dd0);
			r.ciName = "the mean difference μ_d"; r.info = [["Mean difference d̄", f(r.mean)], ["SD of the differences", f(r.sd)], ["Pairs n", r.n], ["Standard error", f(r.se)], ["Differences", r.diffs.slice(0, 30).map(function (v) { return f(v); }).join(", ") + (r.diffs.length > 30 ? "…" : "")]];
		} else if (t === "prop1") {
			var x = need(num("x"), "x"), n = need(num("n"), "n"), p0 = need(num("p0"), "p₀"); if (p0 > 1) p0 /= 100;
			if (!(n > 0) || x < 0 || x > n) throw new Error("x must be between 0 and n."); if (!(p0 > 0 && p0 < 1)) throw new Error("p₀ must be between 0 and 1.");
			r = M.propTest1(x, n, p0, alt, conf); r.h0 = "p = " + f(p0); r.h1 = "p " + ALTS[alt] + " " + f(p0); r.claim = "the population proportion is " + ALTW[alt] + " " + f(p0);
			r.ciName = "the proportion p"; r.info = [["Sample proportion p̂", f(r.est) + " (" + pct(r.est, 1) + ")"], ["Standard error (for the test)", f(Math.sqrt(p0 * (1 - p0) / n))], ["Wilson score interval", f(r.wilson[0]) + " to " + f(r.wilson[1])]];
			if (r.small) r.warn = "n·p₀ or n·(1 − p₀) is below 10, so the normal approximation is rough. An exact binomial test (Probability tab, Binomial) is better here.";
		} else if (t === "prop2") {
			var x1 = need(num("x1"), "group 1 successes"), n1 = need(num("n1"), "group 1 n"), x2 = need(num("x2"), "group 2 successes"), n2 = need(num("n2"), "group 2 n");
			if (!(n1 > 0 && n2 > 0) || x1 < 0 || x2 < 0 || x1 > n1 || x2 > n2) throw new Error("Successes must be between 0 and n in each group.");
			r = M.propTest2(x1, n1, x2, n2, alt, conf); if (!(r.pooled > 0 && r.pooled < 1)) throw new Error("Both groups are all successes or all failures, so there is nothing to test.");
			r.h0 = "p₁ = p₂"; r.h1 = "p₁ " + ALTS[alt] + " p₂"; r.claim = "proportion 1 is " + ALTW[alt] + " proportion 2";
			r.ciName = "the difference p₁ − p₂"; r.info = [["p̂₁", f(r.p1) + " (" + pct(r.p1, 1) + ")"], ["p̂₂", f(r.p2) + " (" + pct(r.p2, 1) + ")"], ["Pooled p̂", f(r.pooled)], ["Difference p̂₁ − p̂₂", f(r.est)]];
			if (r.small) r.warn = "Some groups have fewer than 5 successes or failures, so the normal approximation is rough.";
		} else if (t === "gof") {
			var obs = list("obs"), ex = list("exp"); if (obs.length < 2) throw new Error("Type at least 2 observed counts.");
			r = M.chiGof(obs, ex); if (r.error) throw new Error(r.error);
			r.h0 = "the counts follow the expected proportions"; r.h1 = "they do not"; r.claim = "the counts do not follow the expected proportions";
			r.table = "<tr><th>Category</th><th>Observed</th><th>Expected</th><th>(O − E)² ÷ E</th></tr>" + obs.map(function (o, i) { return "<tr><td>" + (i + 1) + "</td><td>" + f(o) + "</td><td>" + f(r.expected[i]) + "</td><td>" + f(r.parts[i]) + "</td></tr>"; }).join("") + '<tr class="is-active"><td>Total</td><td>' + f(r.n) + "</td><td>" + f(r.n) + "</td><td>χ² = " + f(r.stat) + "</td></tr>";
			if (r.lowExp) r.warn = r.lowExp + " expected count(s) are below 5, so the chi-square approximation may not be reliable. Combine small categories if you can.";
		} else if (t === "indep") {
			var tb = M.parseTable(tget("tab"), "auto"), rows = tb.rows.map(function (rw) { return rw.map(function (c) { return M.toNum(c, tb.mark); }).filter(isFinite); }).filter(function (rw) { return rw.length; });
			r = M.chiIndep(rows); if (r.error) throw new Error(r.error);
			r.h0 = "the two variables are independent"; r.h1 = "they are related"; r.claim = "the two variables are related (not independent)";
			r.table = "<tr><th></th>" + r.colSums.map(function (c, j) { return "<th>Column " + (j + 1) + "</th>"; }).join("") + "<th>Total</th></tr>" + rows.map(function (rw, i) { return "<tr><th scope=\"row\">Row " + (i + 1) + "</th>" + rw.map(function (c, j) { return "<td>" + f(c, 0) + ' <span class="sc-why">(' + f(r.expected[i][j], 2) + ")</span></td>"; }).join("") + "<td>" + f(r.rowSums[i], 0) + "</td></tr>"; }).join("") + '<tr class="is-active"><th scope="row">Total</th>' + r.colSums.map(function (c) { return "<td>" + f(c, 0) + "</td>"; }).join("") + "<td>" + f(r.n, 0) + "</td></tr>";
			r.tableNote = "Expected counts (if the variables were independent) are in brackets: row total × column total ÷ grand total.";
			r.info = [["Cramér's V (strength, 0 to 1)", f(r.cramerV, 3)]];
			if (r.lowExp) r.warn = r.lowExp + " of " + r.cells + " expected counts are below 5, so the chi-square approximation may not be reliable" + (r.cells === 4 ? " (Fisher's exact test is the usual choice for a small 2 × 2 table)." : ".");
		} else {
			var raw = tget("g"), groups;
			if (/\t/.test(raw)) groups = M.parseColumns(raw, "auto").cols; else groups = raw.split(/\n/).map(function (l) { return M.parseNumbers(l, "auto").values; }).filter(function (g) { return g.length; });
			r = M.anova(groups); if (r.error) throw new Error(r.error + (groups.length < 2 ? " Put each group on its own line." : ""));
			r.h0 = "all the group means are equal"; r.h1 = "at least one is different"; r.claim = "at least one group mean is different from the others";
			r.table = "<tr><th>Source</th><th>SS</th><th>df</th><th>MS</th><th>F</th><th>p</th></tr><tr><td>Between groups</td><td>" + f(r.ssb) + "</td><td>" + r.df + "</td><td>" + f(r.msb) + "</td><td>" + f(r.stat, 3) + "</td><td>" + fp(r.p) + "</td></tr><tr><td>Within groups</td><td>" + f(r.ssw) + "</td><td>" + r.df2 + "</td><td>" + f(r.msw) + "</td><td></td><td></td></tr><tr class=\"is-active\"><td>Total</td><td>" + f(r.sst) + "</td><td>" + (r.N - 1) + "</td><td></td><td></td><td></td></tr>";
			r.table2 = "<tr><th>Group</th><th>n</th><th>Mean</th><th>SD</th></tr>" + r.groups.map(function (g, i) { return "<tr><td>" + (i + 1) + "</td><td>" + g.n + "</td><td>" + f(g.mean) + "</td><td>" + f(g.sd) + "</td></tr>"; }).join("");
			r.info = [["η² (share of variation between groups)", f(r.eta2, 3)]];
		}
		return r;
	}
	var tBuilt = false;
	function renderTest() { if (!tBuilt) { buildTest(); tBuilt = true; } renderTestOut(); }
	function renderTestOut() {
		var out = $("sc-tout"), r;
		var any = testFields().some(function (p) { return String(tget(p[0], p[2] !== A ? p[2] : "")).trim() && !(p[0] === "d0"); });
		if (!any) { out.innerHTML = '<div class="tu-card sc-empty">Fill in the boxes above, or press <b>Fill in an example</b>.</div>'; return; }
		try { r = runTest(); } catch (e) { out.innerHTML = '<div class="tu-card sc-empty">' + esc(e.message) + "</div>"; return; }
		var alpha = +S.alpha, rej = r.p < alpha, conf = 1 - alpha, alt = TESTS[S.test].noalt ? "greater" : S.alt;
		var dfTxt = r.df2 != null ? r.df + ", " + r.df2 : r.df != null ? (Math.abs(r.df - Math.round(r.df)) < 1e-9 ? String(Math.round(r.df)) : f(r.df, 3)) : "";
		var apa = r.statName + (dfTxt ? "(" + dfTxt + ")" : "") + " = " + f(r.stat, 3) + ", p " + (r.p < 0.0001 ? "< 0.0001" : "= " + r.p.toFixed(4));
		var h = '<div class="tu-stats">' + tile("Test statistic " + r.statName, f(r.stat, 4), dfTxt ? "degrees of freedom " + dfTxt : "", true) + tile("p-value", fp(r.p), TESTS[S.test].noalt ? "right tail" : { two: "two-sided", less: "left tail", greater: "right tail" }[S.alt]) +
			tile("Decision at α = " + S.alpha, rej ? "Reject H₀" : "Do not reject H₀", rej ? "p < α" : "p ≥ α") + (r.ci ? tile(pct(conf, conf > 0.99 ? 1 : 0) + " confidence interval", f(r.ci[0]) + " to " + f(r.ci[1]), "for " + r.ciName) : "") + "</div>";
		h += '<div class="tu-card"><p class="sc-hyp">H₀: ' + esc(r.h0) + "<br>H₁: " + esc(r.h1) + '</p><p class="sc-concl ' + (rej ? "sc-yes" : "sc-no") + '">' + (rej ? "At the " + pct(alpha, alpha < 0.01 ? 1 : 0) + " significance level there <b>is</b> enough evidence that " + esc(r.claim) + " (" + esc(apa) + ")." : "At the " + pct(alpha, alpha < 0.01 ? 1 : 0) + " significance level there is <b>not</b> enough evidence that " + esc(r.claim) + " (" + esc(apa) + "). This does not prove H₀; the data are simply consistent with it.") + "</p>";
		if (r.ci && !TESTS[S.test].noalt && S.alt !== "two") h += '<p class="tu-note">The confidence interval is the usual two-sided one; a one-sided test at α matches a two-sided interval at 1 − 2α.</p>';
		if (r.warn) h += '<p class="sc-warn">' + esc(r.warn) + "</p>";
		if (r.info) h += '<div class="tu-table-wrap"><table class="tu-table sc-kv">' + r.info.map(function (q) { return '<tr><th scope="row">' + q[0] + "</th><td>" + q[1] + "</td></tr>"; }).join("") + "</table></div>";
		// the statistic on its null distribution
		var st = r.stat, pdf, lo, hi, regions = [], df = r.df;
		if (r.statName === "z" || r.statName === "t") {
			pdf = r.statName === "z" ? function (x) { return M.normPdf(x); } : function (x) { return M.tPdf(x, df); };
			var lim = Math.max(4, Math.min(12, Math.abs(st) * 1.15)); lo = -lim; hi = lim; var as = Math.abs(st);
			regions = S.alt === "two" ? [[-1e300, -as], [as, 1e300]] : S.alt === "less" ? [[-1e300, st]] : [[st, 1e300]];
		} else if (r.statName === "F") { var d1 = r.df, d2 = r.df2; pdf = function (x) { return M.fPdf(x, d1, d2); }; lo = 0; hi = Math.max(M.fInv(0.995, d1, d2), Math.min(st * 1.15, 1e6)); regions = [[st, 1e300]]; }
		else { pdf = function (x) { return M.chiPdf(x, df); }; lo = 0; hi = Math.max(M.chiInv(0.999, df), Math.min(st * 1.15, 1e6)); regions = [[st, 1e300]]; }
		h += '<div class="sc-chart">' + curveSvg({ pdf: pdf, lo: lo, hi: hi, regions: regions, marks: [{ x: st, label: r.statName + " = " + f(st, 3) }], label: "Null distribution with the p-value shaded" }) + '</div><p class="tu-note">The curve is what the test statistic would look like if H₀ were true. The shaded area is the p-value: the chance of a result at least as extreme as yours.</p></div>';
		if (r.table) h += '<div class="tu-card"><div class="tu-table-wrap"><table class="tu-table">' + r.table + "</table></div>" + (r.tableNote ? '<p class="tu-note">' + r.tableNote + "</p>" : "") + (r.table2 ? '<div class="tu-table-wrap"><table class="tu-table">' + r.table2 + "</table></div>" : "") + "</div>";
		out.innerHTML = h;
	}

	/* ================= 5. sample size ================= */
	var SIZES = {
		prop: { name: "Sample size for a survey (proportion)", f: [["E", "Margin of error ± (%)", "5"], ["conf", "Confidence level (%)", "95"], ["p", "Expected proportion (%)", "50"], ["N", "Population size (optional)", ""]], desc: "How many people to ask so the result is within ± the margin. 50% is the safe guess when you have no idea: it gives the largest sample." },
		mean: { name: "Sample size for estimating a mean", f: [["sigma", "Standard deviation σ (a guess or a pilot study)", "15"], ["E", "Margin of error ± (same units)", "3"], ["conf", "Confidence level (%)", "95"], ["N", "Population size (optional)", ""]], desc: "How many measurements so the mean is within ± the margin." },
		moep: { name: "Margin of error for a proportion", f: [["n", "Sample size n", "1000"], ["p", "Proportion (%)", "50"], ["conf", "Confidence level (%)", "95"], ["N", "Population size (optional)", ""]], desc: "The ± a poll of this size has." },
		moem: { name: "Margin of error for a mean", f: [["sigma", "Standard deviation σ or s", "15"], ["n", "Sample size n", "100"], ["conf", "Confidence level (%)", "95"], ["N", "Population size (optional)", ""]], desc: "The ± of a mean from a sample of this size (normal approximation, z)." },
		two: { name: "People per group to compare two means (power)", f: [["sigma", "Standard deviation σ", "10"], ["delta", "Smallest difference worth finding", "5"], ["alpha", "Significance α", "0.05"], ["power", "Power (%)", "80"]], desc: "How many in each group to have this chance (the power) of detecting the difference with a two-sided test." },
		twop: { name: "People per group to compare two proportions (power)", f: [["p1", "Proportion in group 1 (%)", "50"], ["p2", "Proportion in group 2 (%)", "40"], ["alpha", "Significance α", "0.05"], ["power", "Power (%)", "80"]], desc: "How many in each group to detect the difference between two rates (A/B tests)." }
	};
	$("sc-sz").innerHTML = Object.keys(SIZES).map(function (k) { return '<option value="' + k + '">' + SIZES[k].name + "</option>"; }).join("");
	function sget(id) { var o = S.sv[S.sz] || {}, d = SIZES[S.sz].f.filter(function (p) { return p[0] === id; })[0]; return o[id] != null ? o[id] : d ? d[2] : ""; }
	function buildSize() {
		if (!SIZES[S.sz]) S.sz = "prop"; $("sc-sz").value = S.sz; $("sc-sdesc").textContent = SIZES[S.sz].desc;
		$("sc-spar").innerHTML = SIZES[S.sz].f.map(function (p) { return '<div class="tu-field tu-field--sm"><label for="sc-sv-' + p[0] + '">' + p[1] + '</label><input id="sc-sv-' + p[0] + '" data-k="' + p[0] + '" class="tu-input" type="text" inputmode="decimal" autocomplete="off" value="' + esc(sget(p[0])) + '"' + (p[0] === "N" ? ' placeholder="unlimited"' : "") + "></div>"; }).join("");
	}
	$("sc-sz").addEventListener("change", function () { S.sz = this.value; save(); buildSize(); renderSizeOut(); });
	$("sc-spar").addEventListener("input", function (e) { var k = e.target.getAttribute("data-k"); if (!k) return; S.sv[S.sz] = S.sv[S.sz] || {}; S.sv[S.sz][k] = e.target.value; save(); renderSizeOut(); });
	var sBuilt = false;
	function renderSize() { if (!sBuilt) { buildSize(); sBuilt = true; } renderSizeOut(); }
	function pctIn(id) { var v = numIn(String(sget(id)).replace("%", "")); return v > 1 ? v / 100 : v; }
	function renderSizeOut() {
		var out = $("sc-sout"), k = S.sz, h = "", conf, N = numIn(sget("N")); if (!(N > 0)) N = 0;
		function bad(m) { out.innerHTML = '<div class="tu-card sc-empty">' + esc(m) + "</div>"; }
		if (k !== "two" && k !== "twop") { conf = confIn(sget("conf")); if (!(conf > 0 && conf < 1)) return bad("Type a confidence level between 0 and 100%, such as 95."); }
		var fpcNote = N ? " Finite population correction for N = " + N.toLocaleString("en") + ": n = n₀ ÷ (1 + (n₀ − 1) ÷ N)." : "";
		if (k === "prop") {
			var E = pctIn("E"), p = pctIn("p"); if (!(E > 0 && E < 1)) return bad("Type a margin of error such as 5 (%)."); if (!(p >= 0 && p <= 1)) return bad("Type a proportion from 0 to 100%.");
			var r = M.sizeProp(p, E, conf, N);
			h = '<div class="tu-stats">' + tile("People needed", r.n.toLocaleString("en"), "for ±" + pct(E, 2) + " at " + pct(conf, 1) + " confidence", true) + tile("z*", f(r.z, 4), "critical value") + "</div>";
			h += '<div class="tu-card"><p>n₀ = z² · p(1 − p) ÷ E² = ' + f(r.z, 4) + "² × " + f(p) + " × " + f(1 - p) + " ÷ " + f(E) + "² = " + f(r.n0, 2) + (N ? ", then n = " + f(r.n0, 2) + " ÷ (1 + " + f(r.n0 - 1, 2) + " ÷ " + N + ")" : "") + ", rounded up to <b>" + r.n.toLocaleString("en") + "</b>." + esc(fpcNote) + "</p>";
			var Es = [0.01, 0.02, 0.03, 0.04, 0.05, 0.1], Cs = [0.9, 0.95, 0.99];
			h += '<h3>People needed for other margins</h3><div class="tu-table-wrap"><table class="tu-table"><tr><th>Margin ±</th>' + Cs.map(function (c) { return "<th>" + pct(c, 0) + "</th>"; }).join("") + "</tr>" + Es.map(function (e) { return "<tr><td>" + pct(e, 0) + "</td>" + Cs.map(function (c) { return "<td>" + M.sizeProp(p, e, c, N).n.toLocaleString("en") + "</td>"; }).join("") + "</tr>"; }).join("") + "</table></div></div>";
		} else if (k === "mean") {
			var sg = numIn(sget("sigma")), Em = numIn(sget("E")); if (!(sg > 0) || !(Em > 0)) return bad("Type a standard deviation and a margin above 0.");
			var rm = M.sizeMean(sg, Em, conf, N);
			h = '<div class="tu-stats">' + tile("Sample size", rm.n.toLocaleString("en"), "for ±" + f(Em) + " at " + pct(conf, 1) + " confidence", true) + tile("z*", f(rm.z, 4), "") + '</div><div class="tu-card"><p>n₀ = (z · σ ÷ E)² = (' + f(rm.z, 4) + " × " + f(sg) + " ÷ " + f(Em) + ")² = " + f(rm.n0, 2) + ", rounded up to <b>" + rm.n.toLocaleString("en") + "</b>." + esc(fpcNote) + '</p><p class="tu-note">This uses z, so it assumes σ is about right. With a small sample a t-based interval will be a little wider.</p></div>';
		} else if (k === "moep") {
			var n = numIn(sget("n")), pp = pctIn("p"); if (!(n >= 1)) return bad("Type a sample size."); if (!(pp >= 0 && pp <= 1)) return bad("Type a proportion from 0 to 100%.");
			var me = M.moeProp(pp, n, conf, N);
			h = '<div class="tu-stats">' + tile("Margin of error", "± " + pct(me.E, 2), "at " + pct(conf, 1) + " confidence", true) + tile("Interval", pct(Math.max(0, pp - me.E), 1) + " to " + pct(Math.min(1, pp + me.E), 1), "around " + pct(pp, 1)) + '</div><div class="tu-card"><p>E = z · √(p(1 − p) ÷ n)' + (N ? " · √((N − n) ÷ (N − 1))" : "") + " = " + f(me.z, 4) + " × √(" + f(pp) + " × " + f(1 - pp) + " ÷ " + n + ")" + (N ? " × " + f(Math.sqrt((N - n) / (N - 1)), 4) : "") + " = <b>" + f(me.E, 4) + "</b>.</p></div>";
		} else if (k === "moem") {
			var sm = numIn(sget("sigma")), nm = numIn(sget("n")); if (!(sm > 0) || !(nm >= 1)) return bad("Type a standard deviation and a sample size.");
			var mm = M.moeMean(sm, nm, conf, N);
			h = '<div class="tu-stats">' + tile("Margin of error", "± " + f(mm.E), "at " + pct(conf, 1) + " confidence", true) + '</div><div class="tu-card"><p>E = z · σ ÷ √n = ' + f(mm.z, 4) + " × " + f(sm) + " ÷ √" + nm + (N ? " × √((N − n) ÷ (N − 1))" : "") + " = <b>" + f(mm.E) + "</b>.</p></div>";
		} else {
			var al = numIn(sget("alpha")), pw = pctIn("power"); if (al > 1) al /= 100; if (!(al > 0 && al < 1) || !(pw > 0 && pw < 1)) return bad("Type α (such as 0.05) and a power (such as 80%).");
			var rt;
			if (k === "two") { var s2 = numIn(sget("sigma")), dl = numIn(sget("delta")); if (!(s2 > 0) || !dl) return bad("Type a standard deviation above 0 and a difference that is not 0."); rt = M.sizeTwoMeans(s2, Math.abs(dl), al, pw);
				h = '<div class="tu-stats">' + tile("Per group", rt.n.toLocaleString("en"), (2 * rt.n).toLocaleString("en") + " in total", true) + tile("Effect size d", f(Math.abs(dl) / s2, 3), "difference ÷ σ") + '</div><div class="tu-card"><p>n = 2 · ((z_(α/2) + z_β) · σ ÷ δ)² = 2 × ((' + f(rt.za, 4) + " + " + f(rt.zb, 4) + ") × " + f(s2) + " ÷ " + f(Math.abs(dl)) + ")² = " + f(rt.n0, 2) + ", rounded up to <b>" + rt.n + "</b> per group.</p>";
			} else { var p1 = pctIn("p1"), p2 = pctIn("p2"); if (!(p1 >= 0 && p1 <= 1 && p2 >= 0 && p2 <= 1) || p1 === p2) return bad("Type two different proportions from 0 to 100%."); rt = M.sizeTwoProps(p1, p2, al, pw);
				h = '<div class="tu-stats">' + tile("Per group", rt.n.toLocaleString("en"), (2 * rt.n).toLocaleString("en") + " in total", true) + tile("Difference", pct(Math.abs(p1 - p2), 1), pct(p1, 1) + " vs " + pct(p2, 1)) + '</div><div class="tu-card"><p>n = (z_(α/2) · √(2p̄(1 − p̄)) + z_β · √(p₁(1 − p₁) + p₂(1 − p₂)))² ÷ (p₁ − p₂)² = ' + f(rt.n0, 2) + ", rounded up to <b>" + rt.n + "</b> per group.</p>"; }
			h += '<p class="tu-note">Normal approximation for a two-sided test. Power is the chance of a significant result if the true difference is this big; 80% is the usual choice, 90% for important studies.</p></div>';
		}
		out.innerHTML = h;
	}

	/* ---------- share link, clear ---------- */
	$("sc-link").addEventListener("click", function () {
		var o = { tab: S.tab, dp: S.dp, dec: S.dec };
		if (S.tab === "describe") { o.dm = S.dm; o.d = S.d; o.f = S.f; o.col = S.col; o.pop = S.pop; o.qm = S.qm; o.bins = S.bins; o.bk = S.bk; o.pv = S.pv; o.zv = S.zv; }
		else if (S.tab === "regress") { o.r = S.r; o.rx = S.rx; o.rm = S.rm; }
		else if (S.tab === "dist") { o.dist = S.dist; o.dq = S.dq; o.dv = {}; for (var k in S.dv) if (k.indexOf(S.dist + ".") === 0) o.dv[k] = S.dv[k]; }
		else if (S.tab === "tests") { o.test = S.test; o.tm = S.tm; o.alt = S.alt; o.alpha = S.alpha; o.tv = {}; o.tv[S.test] = S.tv[S.test] || {}; }
		else { o.sz = S.sz; o.sv = {}; o.sv[S.sz] = S.sv[S.sz] || {}; }
		var url = location.origin + location.pathname + "?s=" + M.encode(o);
		if (url.length > 60000) { toast("Too much data for a link: copy the numbers instead"); return; }
		copyText(url, "Link copied: it opens this tab with your numbers");
	});
	$("sc-clear").addEventListener("click", function () {
		if (S.tab === "describe") { S.d = ""; S.f = ""; S.pv = "90"; S.zv = ""; $("sc-pv").value = S.pv; $("sc-zv").value = ""; syncDescribeInputs(); }
		else if (S.tab === "regress") { S.r = ""; S.rx = ""; }
		else if (S.tab === "dist") { for (var k in S.dv) if (k.indexOf(S.dist + ".") === 0) delete S.dv[k]; buildDist(); }
		else if (S.tab === "tests") { S.tv[S.test] = {}; buildTest(); }
		else { S.sv[S.sz] = {}; buildSize(); }
		save(); renderTab();
	});

	// first paint: an example so the page never opens empty
	if (!S.d && !S.f) S.d = DEX[0][1];
	if (!S.r) S.r = REX[0][1];
	syncDescribeInputs(); $("sc-r").value = S.r; $("sc-rx").value = S.rx;
	showTab(S.tab);
})();
