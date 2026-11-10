/* MES Prime Numbers -- UI (maths in lib.js, global MESPrime). Tabs: check, gcd, sieve, spiral, list.
 * State: localStorage "mes-primes:v1"; links ?tab=&n= (check) / ?g= (gcd) / ?a=&b= (list). */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("pm"); if (!root || !window.MESPrime) return;
	var P = window.MESPrime, G = P.group, KEY = "mes-primes:v1";
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	var S = Object.assign({ tab: "check", n: "97", g: "84, 120", svn: "120", spm: "ulam", sps: 45, spstart: "1", la: "1", lb: "100", chn: "100000", chv: "count" }, sget());
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	var q = new URLSearchParams(location.search);
	if (q.get("n")) { S.n = q.get("n").slice(0, 400); S.tab = "check"; }
	if (q.get("g")) { S.g = q.get("g").slice(0, 400); S.tab = "gcd"; }
	if (q.get("a") && q.get("b")) { S.la = q.get("a").slice(0, 30); S.lb = q.get("b").slice(0, 30); S.tab = "list"; }
	if (q.get("tab")) S.tab = q.get("tab");
	function dark() { return document.body.classList.contains("dark-mode"); }
	function toast(t) { var el = document.querySelector(".tu-toast"); if (!el) { el = document.createElement("div"); el.className = "tu-toast"; document.body.appendChild(el); } el.textContent = t; el.classList.add("tu-toast--show"); clearTimeout(toast.t); toast.t = setTimeout(function () { el.classList.remove("tu-toast--show"); }, 1800); }
	function copy(t, msg) { (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast(msg || "Copied"); }, function () { var ta = document.createElement("textarea"); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg || "Copied"); } catch (e) {} ta.remove(); }); }
	function setURL(params) { var u = new URL(location.href); ["tab", "n", "g", "a", "b"].forEach(function (k) { u.searchParams.delete(k); }); Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); }); history.replaceState(null, "", u.pathname + (u.search || "") + u.hash); }
	function ns(n) { return G(n.toString()); }

	/* ---------- tabs ---------- */
	var TABS = ["check", "gcd", "sieve", "spiral", "list"], inited = {};
	function showTab(t, push) {
		if (TABS.indexOf(t) < 0) t = "check"; S.tab = t; save();
		root.querySelectorAll("#pm-tabs button").forEach(function (b) { b.setAttribute("aria-selected", b.dataset.t === t); b.tabIndex = b.dataset.t === t ? 0 : -1; });
		root.querySelectorAll(".pm-pane").forEach(function (p) { p.hidden = p.dataset.pane !== t; });
		if (!inited[t]) { inited[t] = 1; ({ sieve: initSieve, spiral: initSpiral, list: initList })[t] && ({ sieve: initSieve, spiral: initSpiral, list: initList })[t](); }
		if (t === "spiral") drawSpiral();
		if (t === "list") drawChart();
		if (push) setURL(t === "check" ? { n: S.n } : t === "gcd" ? { g: S.g } : { tab: t });
	}
	$("pm-tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-t]"); if (b) showTab(b.dataset.t, true); });
	$("pm-tabs").addEventListener("keydown", function (e) {
		var i = TABS.indexOf(S.tab), j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -9;
		if (j === -9) return; e.preventDefault(); j = (j + TABS.length) % TABS.length; showTab(TABS[j], true); root.querySelector('#pm-tabs [data-t="' + TABS[j] + '"]').focus();
	});

	/* ---------- check ---------- */
	var EX = [["97", "97"], ["91", "91"], ["561", "561"], ["1,000,003", "1000003"], ["2^61−1", "2^61-1"], ["2^67−1", "2^67-1"], ["600851475143", "600851475143"], ["10!+1", "10!+1"], ["8128", "8128"]];
	$("pm-ex").insertAdjacentHTML("beforeend", EX.map(function (x) { return '<button type="button" class="tu-chip" data-v="' + esc(x[1]) + '">' + esc(x[0]) + "</button>"; }).join(""));
	$("pm-ex").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) { $("pm-n").value = b.dataset.v; runCheck(); } });
	$("pm-form").addEventListener("submit", function (e) { e.preventDefault(); runCheck(); });
	function bump(d) { var r = P.parse($("pm-n").value); if (r.err) return; var v = r.v + BigInt(d); if (v < 0n) v = 0n; $("pm-n").value = v.toString(); runCheck(); }
	$("pm-up").onclick = function () { bump(1); }; $("pm-dn").onclick = function () { bump(-1); };
	function checkNumber(v) { $("pm-n").value = String(v); showTab("check"); runCheck(); window.scrollTo({ top: root.getBoundingClientRect().top + scrollY - 70, behavior: "smooth" }); }
	root.addEventListener("click", function (e) { var a = e.target.closest("[data-check]"); if (a) { e.preventDefault(); checkNumber(a.dataset.check); } });

	var lastRep = null;
	function runCheck(ms) {
		var src = $("pm-n").value, r = P.parse(src), err = $("pm-err");
		if (r.err) { err.textContent = r.err; err.hidden = false; return; }
		err.hidden = true; S.n = src.trim(); save(); if (S.tab === "check") setURL({ n: S.n });
		var out = $("pm-out"); out.innerHTML = '<div class="tu-card pm-wait">Working it out…</div>';
		setTimeout(function () { lastRep = P.analyze(r.v, { ms: ms || 1500 }); renderCheck(lastRep); }, 20);
	}
	function verdict(rep) {
		var n = rep.n, a = n < 0n ? -n : n, s = ns(n);
		if (rep.kind === "zero") return ["pm-v-no", "0 is not prime", "Zero is divisible by every number, so it is neither prime nor composite."];
		if (rep.kind === "one") return ["pm-v-no", s + " is not prime", "1 has only one divisor (itself). Primes need exactly two, so 1 is neither prime nor composite." + (rep.neg ? " Negative numbers are not prime either." : "")];
		if (rep.neg) return ["pm-v-no", s + " is not prime", "Primes are positive. Below is the factorization of " + ns(a) + "."];
		if (rep.kind === "prime") return [rep.status === "probable" ? "pm-v-prob" : "pm-v-yes", s + (rep.status === "probable" ? " is a probable prime" : " is a prime number"), rep.status === "probable" ? "It passed 33 Miller–Rabin rounds. No number is known that passes them and isn't prime, but for numbers this size it is not a formal proof." : "Its only divisors are 1 and " + s + "."];
		return ["pm-v-no", s + " is not prime", rep.fr.rest ? "It is composite (it failed the Miller–Rabin test), but part of it could not be split in time." : "It is composite: " + ns(rep.fr.f[0][0]) + " divides it."];
	}
	function tile(label, val, sub, cls) { return '<div class="tu-stat' + (cls ? " " + cls : "") + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value pm-tv">' + val + "</div>" + (sub ? '<div class="tu-stat__sub">' + sub + "</div>" : "") + "</div>"; }
	function renderCheck(rep) {
		var out = $("pm-out"), v = verdict(rep), n = rep.n, a = n < 0n ? -n : n, h = "";
		var digits = a.toString().length;
		h += '<div class="tu-card pm-hero ' + v[0] + '"><div class="pm-badge">' + (v[0] === "pm-v-yes" ? "✓ PRIME" : v[0] === "pm-v-prob" ? "≈ PROBABLE PRIME" : rep.kind === "composite" ? "✗ COMPOSITE" : "NEITHER") + '</div><h2 class="pm-verdict">' + esc(v[1]) + '</h2><p>' + esc(v[2]) + "</p>";
		if (rep.fr && rep.kind === "composite") h += '<div class="pm-fact"><span class="pm-fl">' + ns(a) + ' =</span> ' + factHtml(rep.fr.f) + (rep.fr.rest ? ' × <span class="pm-rest" title="composite, not split yet">' + ns(rep.fr.rest) + "</span>" : "") + "</div>";
		if (rep.fr && rep.fr.rest) h += '<p class="pm-warn">The last part (' + rep.fr.rest.toString().length + ' digits) is composite but has no small factor. <button type="button" class="tu-btn tu-btn--ghost" id="pm-more">Keep trying for 15 seconds</button></p>';
		h += '<div class="pm-acts"><button type="button" class="tu-btn tu-btn--ghost" id="pm-cp">Copy result</button><button type="button" class="tu-btn tu-btn--ghost" id="pm-ln">🔗 Copy link</button></div></div>';
		if (rep.fr) {
			h += '<div class="tu-stats pm-stats">';
			h += tile("Digits", G(digits));
			if (rep.nd != null) h += tile("Divisors", ns(rep.nd), rep.kind === "prime" ? "1 and itself" : "counting 1 and " + (digits > 12 ? "itself" : ns(a)));
			if (rep.sigma != null) h += tile("Sum of divisors σ(n)", short(rep.sigma));
			if (rep.phi != null) h += tile("Euler's totient φ(n)", short(rep.phi), "numbers up to n coprime to it");
			if (rep.index) h += tile("Position", "#" + G(rep.index), "the " + ord(rep.index) + " prime");
			h += "</div>";
		}
		if (rep.fr && rep.kind === "composite" && !rep.fr.rest) {
			var om = P.bigOmega(rep.fr.f);
			h += '<div class="tu-card"><h2 class="pm-h">Factor tree</h2>' + (om <= 18 ? '<div class="pm-tree">' + treeSvg(a, rep.fr.f) + "</div>" : '<p class="tu-note">' + G(om) + " prime factors: too many to draw as a tree.</p>") + '<p class="tu-note">Keep splitting off the smallest prime until only primes (circled) are left. In whatever order you split, you always end with the same primes.</p></div>';
		}
		if (rep.divs) {
			var d = rep.divs, big = d.length > 400, shown = big ? d.slice(0, 200).concat(["…"], d.slice(-100)) : d;
			h += '<div class="tu-card"><h2 class="pm-h">All ' + G(d.length) + ' divisors</h2><div class="pm-divs">' + shown.map(function (x) { return x === "…" ? '<span class="pm-gap">… ' + G(d.length - 300) + " more …</span>" : '<a href="?n=' + x + '" data-check="' + x + '" class="pm-dv' + (P.isPrime(x) ? " pm-isp" : "") + '">' + ns(x) + "</a>"; }).join("") + '</div><p class="tu-note">Prime divisors are green. Click one to check it.</p>';
			if (a <= 120n && a > 1n) h += rects(Number(a), d);
			else if (d.length <= 64) h += '<div class="pm-pairs">' + pairs(d, a).map(function (p) { return '<span class="pm-pair">' + ns(p[0]) + " × " + ns(p[1]) + "</span>"; }).join("") + "</div>";
			h += "</div>";
		}
		if (rep.props && rep.props.length) h += '<div class="tu-card"><h2 class="pm-h">Special properties</h2><div class="pm-props">' + rep.props.map(function (t) { return '<div class="pm-prop"><b>' + esc(t[1]) + "</b> " + esc(t[2]) + "</div>"; }).join("") + "</div>" + (rep.goldbach ? '<p class="pm-gb">Goldbach: ' + ns(a) + " = " + ns(rep.goldbach[0]) + " + " + ns(rep.goldbach[1]) + ' (two primes).</p>' : "") + "</div>";
		else if (rep.goldbach) h += '<div class="tu-card"><p class="pm-gb">Goldbach: ' + ns(a) + " = " + ns(rep.goldbach[0]) + " + " + ns(rep.goldbach[1]) + " (two primes).</p></div>";
		if (rep.fr) h += nearby(rep, a);
		if (rep.fr) h += why(rep, a);
		out.innerHTML = h;
		var more = $("pm-more"); if (more) more.onclick = function () { runCheck(15000); };
		$("pm-cp").onclick = function () { copy(v[1] + (rep.fr && rep.kind === "composite" ? "\n" + a + " = " + P.fstr(rep.fr.f, true).replace(/,/g, "") + (rep.fr.rest ? " * " + rep.fr.rest : "") : "") + (rep.nd != null ? "\nDivisors: " + rep.nd : "")); };
		$("pm-ln").onclick = function () { copy(location.origin + location.pathname + "?n=" + encodeURIComponent(S.n), "Link copied"); };
	}
	function short(x) { var s = x.toString(); return s.length > 30 ? s.slice(0, 12) + "…" + s.slice(-6) + ' <small>(' + s.length + " digits)</small>" : ns(x); }
	function ord(k) { var s = ["th", "st", "nd", "rd"], v = k % 100; return G(k) + (s[(v - 20) % 10] || s[v] || s[0]); }
	function factHtml(f) { return f.map(function (x) { return '<span class="pm-pf">' + ns(x[0]) + (x[1] > 1 ? "<sup>" + x[1] + "</sup>" : "") + "</span>"; }).join(' <span class="pm-x">×</span> '); }
	function pairs(d, a) { var out = []; for (var i = 0; i < d.length && d[i] * d[i] <= a; i++) out.push([d[i], a / d[i]]); return out; }
	function rects(n, d) {   // every way to arrange n dots in a rectangle
		var ps = pairs(d.map(function (x) { return x; }), BigInt(n)).map(function (p) { return [Number(p[0]), Number(p[1])]; });
		var h = '<h3 class="pm-h3">' + n + " dots arranged in rectangles</h3><div class=\"pm-rects\">";
		ps.forEach(function (p) {
			var r = p[0], c = p[1], cell = Math.max(4, Math.min(12, Math.floor(260 / c))), w = c * cell, hh = r * cell, s = "";
			for (var i = 0; i < r; i++) for (var j = 0; j < c; j++) s += '<circle cx="' + (j * cell + cell / 2) + '" cy="' + (i * cell + cell / 2) + '" r="' + (cell * 0.36) + '"/>';
			h += '<figure class="pm-rect"><svg viewBox="0 0 ' + w + " " + hh + '" width="' + w + '" height="' + hh + '" aria-hidden="true">' + s + "</svg><figcaption>" + r + " × " + c + "</figcaption></figure>";
		});
		return h + '</div><p class="tu-note">' + (ps.length === 1 ? "Only one rectangle is possible, a single line: that is what makes " + n + " prime." : n + " can be arranged " + ps.length + " ways. A prime can only make one: a single line.") + "</p>";
	}
	function treeSvg(n, f) {
		var list = []; f.forEach(function (x) { for (var i = 0; i < x[1]; i++) list.push(x[0]); });
		var nodes = [], cur = n, x = 0, y = 0, CW = 8.4;
		function wOf(v) { return Math.max(34, ns(v).length * CW + 18); }
		for (var i = 0; i < list.length; i++) {
			if (i === list.length - 1) { nodes.push({ v: cur, x: x, y: y, prime: true }); break; }
			var p = list[i], rest = cur / p, wc = wOf(cur), wp = wOf(p), wr = wOf(rest), idx = nodes.length;
			nodes.push({ v: cur, x: x, y: y, kids: [idx + 1, idx + 2] });
			nodes.push({ v: p, x: x - Math.max(36, (wp + wc) / 2.6), y: y + 62, prime: true });
			x += Math.max(36, (wr + wc) / 2.6); y += 62; cur = rest;
		}
		var minX = Infinity, maxX = -Infinity, maxY = 0;
		nodes.forEach(function (nd) { var w = wOf(nd.v) / 2; minX = Math.min(minX, nd.x - w); maxX = Math.max(maxX, nd.x + w); maxY = Math.max(maxY, nd.y); });
		var pad = 6, W = maxX - minX + pad * 2, H = maxY + 40 + pad * 2, s = "";
		nodes.forEach(function (nd) { if (nd.kids) nd.kids.forEach(function (k) { var c = nodes[k]; if (c) s += '<line class="pm-tl" x1="' + (nd.x - minX + pad) + '" y1="' + (nd.y + 18 + pad) + '" x2="' + (c.x - minX + pad) + '" y2="' + (c.y + 4 + pad) + '"/>'; }); });
		nodes.forEach(function (nd) { var w = wOf(nd.v), cx = nd.x - minX + pad, cy = nd.y + 18 + pad - 7; s += '<rect class="' + (nd.prime ? "pm-tp" : "pm-tc") + '" x="' + (cx - w / 2) + '" y="' + (cy - 14) + '" width="' + w + '" height="28" rx="14"/><text x="' + cx + '" y="' + (cy + 5) + '" text-anchor="middle">' + ns(nd.v) + "</text>"; });
		return '<svg viewBox="0 0 ' + W.toFixed(1) + " " + H + '" width="' + W.toFixed(0) + '" style="max-width:100%;height:auto" role="img" aria-label="Factor tree of ' + n + '">' + s + "</svg>";
	}
	function nearby(rep, a) {
		var h = '<div class="tu-card"><h2 class="pm-h">Nearby</h2>';
		if (a < 10n ** 15n) {
			var lo = a > 12n ? a - 12n : 0n, cells = "";
			for (var k = lo; k <= lo + 24n; k++) cells += '<a href="?n=' + k + '" data-check="' + k + '" class="pm-nb' + (k > 1n && P.isPrime(k) ? " pm-isp" : "") + (k === a ? " pm-me" : "") + '">' + ns(k) + "</a>";
			h += '<div class="pm-strip">' + cells + "</div>";
		}
		if (rep.prev !== undefined) {
			h += '<p class="pm-nbt">';
			if (rep.prev) h += 'Previous prime: <a href="?n=' + rep.prev + '" data-check="' + rep.prev + '">' + short(rep.prev) + "</a> (" + ns(a - rep.prev) + " below). ";
			h += 'Next prime: <a href="?n=' + rep.next + '" data-check="' + rep.next + '">' + short(rep.next) + "</a> (" + ns(rep.next - a) + " above).";
			if (a > 10n) { var ds = a.toString(), lnA = (ds.length - 1) * Math.LN10 + Math.log(Number(ds.slice(0, 15)) / Math.pow(10, Math.min(15, ds.length) - 1)); h += " On average, primes near here are about " + G(Math.round(lnA * 10) / 10) + " apart (ln n)."; }
			h += "</p>";
		}
		return h + "</div>";
	}
	function why(rep, a) {
		var h = '<details class="tu-card pm-why"><summary><h2 class="pm-h">How do we know?</h2></summary>';
		if (a < 1018081n) {
			var root2 = Math.floor(Math.sqrt(Number(a))), tried = P.SMALL.filter(function (p) { return p <= root2; });
			if (rep.kind === "prime") h += "<p>√" + ns(a) + " ≈ " + Math.sqrt(Number(a)).toFixed(2) + ". If " + ns(a) + " had a divisor other than 1 and itself, one of them would be at most √n, and it would have a prime factor no bigger than that. So we only need to try the " + tried.length + " prime" + (tried.length === 1 ? "" : "s") + " up to " + root2 + ":</p><p class=\"pm-tried\">" + (tried.length ? tried.map(function (p) { return p + " ✗"; }).join(" · ") : "(none: 2 and 3 are prime by definition)") + "</p><p>None of them divides evenly, so it is prime.</p>";
			else { var p = rep.fr.f[0][0]; h += "<p>Trying primes in order: " + tried.filter(function (x) { return BigInt(x) <= p; }).map(function (x) { return BigInt(x) === p ? "<b>" + x + " ✓</b>" : x + " ✗"; }).join(" · ") + "</p><p>" + ns(a) + " ÷ " + ns(p) + " = " + ns(a / p) + " exactly, so it is not prime.</p>"; }
		} else {
			var w = P.witness(a);
			h += "<p>For big numbers we use the <b>Miller–Rabin test</b>. Write n − 1 = 2<sup>" + w.s + "</sup> × d with d odd. For a base b, look at b<sup>d</sup>, b<sup>2d</sup>, b<sup>4d</sup>, … (mod n). If n is prime, that list must start at 1 or reach n − 1 (this follows from Fermat's little theorem).</p>";
			if (w.bad) h += "<p>Base <b>" + w.bad + "</b> breaks the rule, which proves " + (a.toString().length > 40 ? "n" : ns(a)) + " is composite" + (rep.fr.f.length ? ", even before finding a factor." : ".") + "</p>";
			else h += "<p>All " + w.tried + " bases (" + "2, 3, 5, … " + ") follow the rule. " + (rep.status === "prime" ? (a < 3317044064679887385961981n ? "For every number below 3.3 × 10²⁴ the first 13 bases are enough to prove primality, so this is certain." : "It is also a known Mersenne prime, proven by the Lucas–Lehmer test.") : "Above 3.3 × 10²⁴ this makes it a probable prime: no counterexample is known.") + "</p>";
			if (rep.kind === "composite" && rep.fr.f.length) h += "<p>The factors were then found by trial division up to 10,000 and Pollard's rho method.</p>";
		}
		return h + "</details>";
	}

	/* ---------- gcd ---------- */
	var GEX = [["84, 120", "84, 120"], ["8, 15", "8, 15"], ["12, 18, 30", "12, 18, 30"], ["1071, 462", "1071, 462"], ["35, 64", "35, 64"], ["2^20, 6^10", "2^20, 6^10"]];
	$("pm-gex").insertAdjacentHTML("beforeend", GEX.map(function (x) { return '<button type="button" class="tu-chip" data-v="' + esc(x[1]) + '">' + esc(x[0]) + "</button>"; }).join(""));
	$("pm-gex").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) { $("pm-g").value = b.dataset.v; runGcd(); } });
	$("pm-gform").addEventListener("submit", function (e) { e.preventDefault(); runGcd(); });
	var COLS = ["#1d4ed8", "#b45309", "#6d28d9", "#be185d", "#0e7490", "#4d7c0f", "#b91c1c", "#4338ca", "#0f766e", "#854d0e"];
	function runGcd() {
		var r = P.parseList($("pm-g").value), err = $("pm-gerr"), out = $("pm-gout");
		if (r.err) { err.textContent = r.err; err.hidden = false; return; }
		var L = r.v.map(function (x) { return x < 0n ? -x : x; });
		if (L.length < 2) { err.textContent = "Type at least two numbers."; err.hidden = false; return; }
		if (L.length > 20) { err.textContent = "Up to 20 numbers, please."; err.hidden = false; return; }
		if (L.some(function (x) { return x.toString().length > 60; })) { err.textContent = "Numbers up to 60 digits here."; err.hidden = false; return; }
		err.hidden = true; S.g = $("pm-g").value.trim(); save(); if (S.tab === "gcd") setURL({ g: S.g });
		var g = P.gcdAll(L), l = L.some(function (x) { return x === 0n; }) ? 0n : P.lcmAll(L), co = g === 1n, h = "";
		var facts = L.map(function (x) { return x > 1n ? P.factor(x, { ms: 400 }) : { f: [], rest: null }; });
		var primeSet = []; facts.forEach(function (fr) { fr.f.forEach(function (x) { if (!primeSet.some(function (p) { return p === x[0]; })) primeSet.push(x[0]); }); });
		primeSet.sort(function (a, b) { return a < b ? -1 : 1; });
		function colr(p) { var i = primeSet.indexOf(p); return COLS[i % COLS.length]; }
		h += '<div class="tu-card pm-hero ' + (co ? "pm-v-yes" : "pm-v-no") + '"><div class="pm-badge">' + (co ? "✓ COPRIME" : "✗ NOT COPRIME") + '</div><h2 class="pm-verdict">' + (co ? "They are coprime" : "They share a factor: " + ns(g)) + "</h2><p>" + (co ? "Their greatest common divisor is 1, so they have no prime factor in common" + (L.length > 2 ? " shared by all of them" : "") + "." : "The greatest common divisor is " + ns(g) + ", not 1.") + "</p></div>";
		h += '<div class="tu-stats">' + tile("GCD (greatest common divisor)", ns(g), "also called HCF / GCF") + tile("LCM (least common multiple)", short(l)) + (L.length === 2 && g ? tile("Product ÷ GCD", short(L[0] * L[1] / g), "= LCM for two numbers") : "") + "</div>";
		// factor rows
		h += '<div class="tu-card"><h2 class="pm-h">Prime factors side by side</h2><div class="tu-table-wrap"><table class="tu-table pm-ftab"><thead><tr><th>Number</th>' + primeSet.map(function (p) { return '<th><span class="pm-dot" style="background:' + colr(p) + '"></span>' + ns(p) + "</th>"; }).join("") + "<th>Factorization</th></tr></thead><tbody>";
		L.forEach(function (x, i) {
			var fr = facts[i]; h += "<tr><td><b>" + ns(x) + "</b></td>" + primeSet.map(function (p) { var e = fr.f.filter(function (y) { return y[0] === p; })[0]; return "<td>" + (e ? e[1] : '<span class="pm-mute">0</span>') + "</td>"; }).join("") + "<td>" + (fr.f.length ? factHtml(fr.f) : x === 1n ? "1" : "0") + (fr.rest ? " × " + ns(fr.rest) : "") + "</td></tr>";
		});
		var gf = primeSet.map(function (p) { return Math.min.apply(null, facts.map(function (fr) { var e = fr.f.filter(function (y) { return y[0] === p; })[0]; return e ? e[1] : 0; })); });
		var lf = primeSet.map(function (p) { return Math.max.apply(null, facts.map(function (fr) { var e = fr.f.filter(function (y) { return y[0] === p; })[0]; return e ? e[1] : 0; })); });
		h += '<tr class="pm-sumrow"><td>GCD = smallest powers</td>' + gf.map(function (e) { return "<td>" + e + "</td>"; }).join("") + "<td>" + (g === 1n ? "1 (nothing shared)" : factHtml(primeSet.map(function (p, i) { return [p, gf[i]]; }).filter(function (x) { return x[1]; }))) + "</td></tr>";
		h += '<tr class="pm-sumrow"><td>LCM = largest powers</td>' + lf.map(function (e) { return "<td>" + e + "</td>"; }).join("") + "<td>" + factHtml(primeSet.map(function (p, i) { return [p, lf[i]]; }).filter(function (x) { return x[1]; })) + "</td></tr>";
		h += "</tbody></table></div></div>";
		if (L.length === 2 && L[0] > 1n && L[1] > 1n && !facts[0].rest && !facts[1].rest) h += venn(L, facts, colr);
		if (L.length > 2 && L.length <= 10) {
			h += '<div class="tu-card"><h2 class="pm-h">Pair by pair</h2><div class="tu-table-wrap"><table class="tu-table pm-ptab"><thead><tr><th>GCD</th>' + L.map(function (x) { return "<th>" + ns(x) + "</th>"; }).join("") + "</tr></thead><tbody>";
			var allPair = true;
			L.forEach(function (x, i) { h += "<tr><th>" + ns(x) + "</th>" + L.map(function (y, j) { if (i === j) return '<td class="pm-mute">–</td>'; var gg = P.gcd(x, y); if (gg !== 1n) allPair = false; return '<td class="' + (gg === 1n ? "pm-c1" : "pm-c0") + '">' + ns(gg) + "</td>"; }).join("") + "</tr>"; });
			h += '</tbody></table></div><p class="tu-note">' + (allPair ? "Every pair has GCD 1: the numbers are <b>pairwise coprime</b>." : "Green = that pair is coprime. " + (co ? "The whole list is coprime (GCD 1) but not every pair is." : "")) + "</p></div>";
		}
		if (L.length === 2 && L[0] && L[1]) {
			var rows = P.euclid(L[0], L[1]), e = P.egcd(L[0], L[1]);
			h += '<div class="tu-card"><h2 class="pm-h">Euclid\'s algorithm</h2><p>Divide the bigger number by the smaller, then the smaller by the remainder, until the remainder is 0. The last non-zero remainder is the GCD.</p><div class="pm-euclid">' + rows.slice(0, 60).map(function (r) { return '<div>' + ns(r[0]) + " = " + ns(r[2]) + " × " + ns(r[1]) + " + <b" + (r[3] === 0n ? ' class="pm-z"' : "") + ">" + ns(r[3]) + "</b></div>"; }).join("") + (rows.length > 60 ? "<div>… " + (rows.length - 60) + " more steps</div>" : "") + "</div>";
			h += '<p>Bézout: ' + ns(L[0]) + " × (" + ns(e[1]) + ") + " + ns(L[1]) + " × (" + ns(e[2]) + ") = " + ns(e[0]) + ".</p>";
			if (L[1] > 0n) { var a0 = L[0] / g, b0 = L[1] / g; h += "<p>As a fraction: " + ns(L[0]) + "⁄" + ns(L[1]) + (g > 1n ? " = <b>" + ns(a0) + "⁄" + ns(b0) + "</b> in lowest terms (both ÷ " + ns(g) + ")." : " is already in lowest terms.") + "</p>"; }
			h += "</div>";
		}
		out.innerHTML = h;
	}
	function venn(L, facts, colr) {
		function bag(fr) { var b = []; fr.f.forEach(function (x) { for (var i = 0; i < x[1]; i++) b.push(x[0]); }); return b; }
		var A = bag(facts[0]), B = bag(facts[1]), both = [], onlyA = [], onlyB = B.slice();
		A.forEach(function (p) { var k = onlyB.indexOf(p); if (k >= 0) { both.push(p); onlyB.splice(k, 1); } else onlyA.push(p); });
		if (A.length + B.length > 40) return "";
		function chips(arr) { return arr.length ? arr.map(function (p) { return '<span class="pm-vc" style="background:' + colr(p) + '">' + ns(p) + "</span>"; }).join("") : '<span class="pm-mute">–</span>'; }
		return '<div class="tu-card"><h2 class="pm-h">Shared prime factors</h2><div class="pm-venn"><div class="pm-vA"><div class="pm-vt">only ' + ns(L[0]) + '</div>' + chips(onlyA) + '</div><div class="pm-vM"><div class="pm-vt">both</div>' + chips(both) + '</div><div class="pm-vB"><div class="pm-vt">only ' + ns(L[1]) + "</div>" + chips(onlyB) + '</div></div><p class="tu-note">Multiply the middle to get the GCD (' + (both.length ? both.map(ns).join(" × ") + " = " : "") + ns(P.gcd(L[0], L[1])) + "). Multiply everything to get the LCM.</p></div>";
	}

	/* ---------- sieve ---------- */
	var SV = null, svTimer = null;
	function initSieve() {
		$("pm-svn").value = S.svn; $("pm-svn").onchange = function () { S.svn = this.value; save(); svReset(); };
		$("pm-svplay").onclick = function () { if (svTimer) svStop(); else svPlay(); };
		$("pm-svstep").onclick = function () { svStop(); svNextPrime(); };
		$("pm-svall").onclick = function () { svStop(); while (svTick()) {} };
		$("pm-svreset").onclick = function () { svStop(); svReset(); };
		$("pm-svgrid").addEventListener("click", function (e) { var c = e.target.closest("[data-k]"); if (c) checkNumber(c.dataset.k); });
		svReset();
	}
	var PCOL = ["#b91c1c", "#1d4ed8", "#b45309", "#6d28d9", "#0e7490", "#be185d", "#4d7c0f", "#c2410c", "#4338ca", "#0f766e", "#9f1239"];
	function svReset() {
		var N = Number(S.svn), g = $("pm-svgrid"), h = "";
		SV = { N: N, cross: new Uint8Array(N + 1), by: new Int16Array(N + 1), p: 1, m: 0, primes: [], done: false };
		for (var k = 1; k <= N; k++) h += '<button type="button" class="pm-c" data-k="' + k + '"' + (k === 1 ? ' data-s="one"' : "") + ">" + k + "</button>";
		g.innerHTML = h; g.style.setProperty("--cols", N <= 50 ? 10 : N <= 300 ? 10 : N <= 500 ? 20 : 25);
		$("pm-svleg").innerHTML = ""; $("pm-svstat").textContent = "1 is not prime. Press Play: the sieve starts with 2."; $("pm-svplay").textContent = "▶ Play";
	}
	function cell(k) { return $("pm-svgrid").children[k - 1]; }
	function svTick() {   // one event; false when finished
		if (!SV || SV.done) return false;
		var N = SV.N;
		if (SV.m) {
			var k = SV.m; SV.m += SV.p;
			if (k > N) { SV.m = 0; return true; }
			var c = cell(k); c.classList.remove("pm-hot");
			if (!SV.cross[k]) { SV.cross[k] = 1; SV.by[k] = SV.p; c.dataset.s = "x"; c.style.setProperty("--pc", PCOL[(SV.primes.length - 1) % PCOL.length]); c.classList.add("pm-hot"); }
			return true;
		}
		var p = SV.p + 1; while (p <= N && SV.cross[p]) p++;
		root.querySelectorAll("#pm-svgrid .pm-hot").forEach(function (c) { c.classList.remove("pm-hot"); });
		if (p > N) { finish(); return false; }
		if (p * p > N) {
			for (var k2 = p; k2 <= N; k2++) if (!SV.cross[k2]) { SV.primes.push(k2); cell(k2).dataset.s = "p"; }
			finish(true, p); return false;
		}
		SV.p = p; SV.primes.push(p); cell(p).dataset.s = "p"; cell(p).style.setProperty("--pc", PCOL[(SV.primes.length - 1) % PCOL.length]); SV.m = p * p;
		$("pm-svstat").innerHTML = "<b>" + p + "</b> is prime (nothing crossed it out). Now cross out its multiples, starting at " + p + " × " + p + " = " + (p * p) + " (smaller multiples are already gone).";
		$("pm-svleg").insertAdjacentHTML("beforeend", '<span class="pm-lg" style="--pc:' + PCOL[(SV.primes.length - 1) % PCOL.length] + '">multiples of ' + p + "</span>");
		return true;
	}
	function finish(early, p) {
		SV.done = true; svStop(); $("pm-svplay").textContent = "▶ Play";
		$("pm-svstat").innerHTML = (early ? "Next would be " + p + ", but " + p + " × " + p + " = " + p * p + " is bigger than " + SV.N + ", so every number still standing is prime. " : "") + "Done: <b>" + SV.primes.length + " primes</b> up to " + SV.N + ".";
	}
	function svNextPrime() { if (!SV || SV.done) svReset(); var start = SV.primes.length; while (svTick() && (SV.primes.length === start || SV.m)) {} }
	function svPlay() {
		if (!SV || SV.done) svReset();
		$("pm-svplay").textContent = "❚❚ Pause";
		(function loop() { var spd = Number($("pm-svspd").value), per = spd >= 8 ? (spd - 7) * 6 : 1, ms = spd >= 8 ? 30 : [0, 420, 300, 200, 130, 80, 50, 35][spd]; for (var i = 0; i < per; i++) if (!svTick()) return; svTimer = setTimeout(loop, ms); })();
	}
	function svStop() { clearTimeout(svTimer); svTimer = null; if (SV && !SV.done) $("pm-svplay").textContent = "▶ Play"; }

	/* ---------- spiral ---------- */
	var spFlags = null, spLayout = null;
	function initSpiral() {
		var seg = $("pm-spmode");
		seg.addEventListener("click", function (e) { var b = e.target.closest("[data-m]"); if (b) { S.spm = b.dataset.m; save(); drawSpiral(); } });
		$("pm-spsize").value = S.sps; $("pm-spsize").oninput = function () { S.sps = Number(this.value); save(); drawSpiral(); };
		$("pm-spstart").value = S.spstart; $("pm-spstart").onchange = function () { S.spstart = this.value; save(); drawSpiral(); };
		$("pm-sptwin").onchange = drawSpiral; $("pm-speuler").onchange = drawSpiral;
		var cv = $("pm-spcv");
		cv.addEventListener("mousemove", spHover); cv.addEventListener("mouseleave", function () { $("pm-sptip").hidden = true; });
		cv.addEventListener("click", function (e) { var k = spAt(e); if (k) checkNumber(k); });
		if (window.ResizeObserver) new ResizeObserver(function () { if (S.tab === "spiral") drawSpiral(); }).observe($("pm-spstage"));
		function addPanel() { if (window.MESPanel) MESPanel.add($("pm-sp-card"), { bar: $("pm-sp-card").querySelector(".pm-head"), onChange: drawSpiral }); else setTimeout(addPanel, 200); }
		addPanel();
	}
	function spParams() {
		var t = S.sps / 100;
		if (S.spm === "sacks") return { count: Math.round(Math.exp(Math.log(200) + t * (Math.log(200000) - Math.log(200)))) };
		var side = 2 * Math.round(5 + t * t * 395) + 1; return { side: side, count: side * side };
	}
	function drawSpiral() {
		if (!inited.spiral || S.tab !== "spiral") return;
		root.querySelectorAll("#pm-spmode button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.m === S.spm); });
		$("pm-spstartw").hidden = S.spm !== "ulam";
		var cv = $("pm-spcv"), stage = $("pm-spstage"), card = $("pm-sp-card"), full = card.classList.contains("mes-pfill");
		var W = stage.clientWidth, H = full ? Math.max(200, card.clientHeight - stage.offsetTop - 50) : Math.min(W, 720), Sz = Math.min(W, H), dpr = Math.min(2, window.devicePixelRatio || 1);
		cv.style.width = Sz + "px"; cv.style.height = Sz + "px"; cv.width = Math.round(Sz * dpr); cv.height = Math.round(Sz * dpr);
		var ctx = cv.getContext("2d"), pr = spParams(), start = 1, ps;
		if (S.spm === "ulam") { var r = P.parse(S.spstart); start = r.err || r.v < 1n || r.v > 10n ** 12n ? 1 : Number(r.v); }
		var maxV = start + pr.count + 10;
		ps = maxV <= 4e6 ? P.sieve(maxV) : null; spFlags = { s: ps, base: 0 };
		if (!ps) { var list = P.primesBetween(start, maxV), arr = new Uint8Array(pr.count + 12); list.forEach(function (x) { arr[x - start] = 1; }); spFlags = { s: arr, base: start }; }
		function isP(v) { return v >= 2 && spFlags.s[v - spFlags.base] === 1; }
		var dk = dark(), bg = dk ? "#121417" : "#ffffff", pc = dk ? "#e6edf3" : "#111827", tc = "#f97316", ec = dk ? "#4ade80" : "#16a34a", euler = $("pm-speuler").checked, twin = $("pm-sptwin").checked;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = bg; ctx.fillRect(0, 0, Sz, Sz);
		var eulerSet = null; if (euler) { eulerSet = new Set(); for (var e = 0; e * e + e + 41 <= maxV; e++) eulerSet.add(e * e + e + 41); }
		var nPrimes = 0;
		if (S.spm === "ulam") {
			var side = pr.side, cell = Sz / side, half = (side - 1) / 2, dot = Math.max(1, cell * (cell > 6 ? 0.82 : 1));
			spLayout = { mode: "ulam", cell: cell, half: half, side: side, start: start };
			for (var k = 1; k <= pr.count; k++) {
				var v = start + k - 1, p = isP(v), ev = eulerSet && eulerSet.has(v);
				if (!p && !ev) continue; if (p) nPrimes++;
				var u = P.ulam(k), x = (u[0] + half) * cell, y = (half - u[1]) * cell;
				ctx.fillStyle = ev ? ec : twin && p && (isP(v - 2) || isP(v + 2)) ? tc : pc;
				if (cell > 6) { ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, dot / 2.2, 0, 7); ctx.fill(); } else ctx.fillRect(x, y, dot, dot);
			}
			if (side <= 25) { ctx.font = Math.max(8, cell * 0.32) + "px system-ui,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; for (k = 1; k <= pr.count; k++) { var vv = start + k - 1, uu = P.ulam(k); ctx.fillStyle = isP(vv) ? bg : dk ? "#6b7280" : "#9ca3af"; ctx.fillText(G(vv), (uu[0] + half + 0.5) * cell, (half - uu[1] + 0.5) * cell); } }
			$("pm-spsl").textContent = side + " × " + side;
			$("pm-spinfo").innerHTML = "Numbers " + G(start) + " to " + G(start + pr.count - 1) + " wound in a square spiral from the centre. <b>" + G(nPrimes) + " primes</b> are dark. Primes pile up on diagonal lines: many quadratic formulas like 4n² + bn + c produce lots of primes." + (euler ? " Green = values of n² + n + 41 (try Start at 41)." : "");
		} else {
			var N = pr.count, R = Sz / 2 - 4, sc = R / Math.sqrt(N), ds = Math.max(1, Math.min(4, sc * 0.7));
			spLayout = { mode: "sacks", sc: sc, c: Sz / 2, N: N };
			for (var j = 2; j <= N; j++) {
				var pj = isP(j), evj = eulerSet && eulerSet.has(j); if (!pj && !evj) continue; if (pj) nPrimes++;
				var rr = Math.sqrt(j) * sc, th = 2 * Math.PI * Math.sqrt(j);
				ctx.fillStyle = evj ? ec : twin && pj && (isP(j - 2) || isP(j + 2)) ? tc : pc;
				ctx.fillRect(Sz / 2 + rr * Math.cos(th) - ds / 2, Sz / 2 - rr * Math.sin(th) - ds / 2, ds, ds);
			}
			$("pm-spsl").textContent = "1 to " + G(N);
			$("pm-spinfo").innerHTML = "Each number n sits at radius √n and angle 2π√n, so the perfect squares line up on the line to the right. <b>" + G(nPrimes) + " primes</b> up to " + G(N) + " trace curves: the values of quadratic formulas." + (euler ? " Green = n² + n + 41." : "");
		}
	}
	function spAt(e) {
		if (!spLayout) return null; var r = $("pm-spcv").getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
		if (spLayout.mode === "ulam") {
			var cx = Math.floor(x / spLayout.cell) - spLayout.half, cy = spLayout.half - Math.floor(y / spLayout.cell), m = Math.max(Math.abs(cx), Math.abs(cy));
			if (m > spLayout.half) return null;
			for (var k = Math.max(1, (2 * m - 1) * (2 * m - 1)); k <= (2 * m + 1) * (2 * m + 1); k++) { var u = P.ulam(k); if (u[0] === cx && u[1] === cy) return spLayout.start + k - 1; }
			return null;
		}
		var dx = x - spLayout.c, dy = spLayout.c - y, rr = Math.sqrt(dx * dx + dy * dy) / spLayout.sc, best = null, bd = 1e9;
		for (var n = Math.max(1, Math.floor((rr - 1) * (rr - 1))); n <= Math.ceil((rr + 1) * (rr + 1)) && n <= spLayout.N; n++) { var t = 2 * Math.PI * Math.sqrt(n), px = Math.sqrt(n) * spLayout.sc * Math.cos(t), py = Math.sqrt(n) * spLayout.sc * Math.sin(t), d = (px - dx) * (px - dx) + (py - dy) * (py - dy); if (d < bd) { bd = d; best = n; } }
		return bd < 64 ? best : null;
	}
	function spHover(e) {
		var k = spAt(e), tip = $("pm-sptip"); if (!k) { tip.hidden = true; return; }
		var st = $("pm-spstage").getBoundingClientRect(); tip.hidden = false; tip.textContent = G(k) + (P.isPrime(BigInt(k)) ? " · prime" : k > 1 ? " · " + P.fstr(P.factor(BigInt(k)).f) : "");
		tip.style.left = Math.min(st.width - 150, e.clientX - st.left + 12) + "px"; tip.style.top = (e.clientY - st.top + 12) + "px";
	}

	/* ---------- list & count ---------- */
	var lastList = [];
	function initList() {
		$("pm-la").value = S.la; $("pm-lb").value = S.lb;
		$("pm-lform").addEventListener("submit", function (e) { e.preventDefault(); runList(); });
		$("pm-lcopy").onclick = function () { if (lastList.length) copy(lastList.join(", "), G(lastList.length) + " primes copied"); };
		$("pm-nform").addEventListener("submit", function (e) { e.preventDefault(); var r = P.parse($("pm-nth").value); if (r.err) return out(r.err); var n = Number(r.v); if (n < 1 || n > P.NTH_MAX) return out("n must be between 1 and " + G(P.NTH_MAX) + "."); out("Working…"); setTimeout(function () { var p = P.nthPrime(n); out("The " + ord(n) + ' prime is <a href="?n=' + p + '" data-check="' + p + '"><b>' + G(p) + "</b></a>."); }, 20); });
		$("pm-cform").addEventListener("submit", function (e) {
			e.preventDefault(); var r = P.parse($("pm-cx").value); if (r.err) return out(r.err); var x = r.v;
			var tab = P.PI_TABLE.filter(function (t) { return 10n ** BigInt(t[0]) === x; })[0];
			if (tab) return out("There are <b>" + ns(tab[1]) + "</b> primes up to " + ns(x) + " (a known value).");
			if (x > BigInt(P.PI_MAX)) return out("Counting is done here up to " + G(P.PI_MAX) + ". For powers of ten the known values go up to 10²⁵ (table below). Estimate: about " + G(Math.round(P.li(Number(x)))) + " (li(x)).");
			out("Counting…"); setTimeout(function () { var c = P.piCount(Number(x)); out("There are <b>" + G(c) + "</b> primes up to " + ns(x) + ". Estimates: x ÷ ln x ≈ " + G(Math.round(Number(x) / Math.log(Number(x)))) + ", li(x) ≈ " + G(Math.round(P.li(Number(x)))) + "."); }, 20);
		});
		function out(t) { $("pm-nres").innerHTML = t; }
		$("pm-chn").value = S.chn; $("pm-chn").onchange = function () { S.chn = this.value; save(); chData = null; drawChart(); };
		$("pm-chv").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (b) { S.chv = b.dataset.v; save(); drawChart(); } });
		$("pm-pitab").tBodies[0].innerHTML = P.PI_TABLE.map(function (t) { var est = t[0] * Math.LN10; return "<tr><td>10" + P.sup(t[0]) + "</td><td>" + ns(t[1]) + "</td><td>" + (t[0] <= 15 ? G(Math.round(Math.pow(10, t[0]) / est)) : (Math.pow(10, t[0]) / est).toExponential(3).replace("e+", " × 10^")) + "</td><td>" + (Math.round(10 / Number(t[1]) * Math.pow(10, t[0] - 1) * 10) / 10).toLocaleString("en-US") + "</td></tr>"; }).join("");
		if (window.ResizeObserver) new ResizeObserver(function () { if (S.tab === "list") drawChart(); }).observe($("pm-chart"));
		function addPanel() { if (window.MESPanel) MESPanel.add($("pm-ch-card"), { bar: $("pm-ch-card").querySelector(".pm-head"), onChange: drawChart }); else setTimeout(addPanel, 200); }
		addPanel();
		runList();
	}
	function runList() {
		var ra = P.parse($("pm-la").value), rb = P.parse($("pm-lb").value), err = $("pm-lerr");
		function bad(t) { err.textContent = t; err.hidden = false; }
		if (ra.err || rb.err) return bad(ra.err || rb.err);
		var a = ra.v, b = rb.v; if (b < a) { var t = a; a = b; b = t; }
		err.hidden = true; S.la = $("pm-la").value.trim(); S.lb = $("pm-lb").value.trim(); save();
		var list;
		if (b <= BigInt(P.RANGE_MAX) && b - a <= BigInt(P.SPAN_MAX)) list = P.primesBetween(Number(a), Number(b)).map(String);
		else if (b - a <= 20000n) { list = []; for (var k = a < 2n ? 2n : a; k <= b; k++) if (P.isPrime(k)) list.push(k.toString()); }
		else return bad("For numbers above 10 trillion the range can be at most 20,000 wide; below that, at most 5,000,000.");
		lastList = list; if (S.tab === "list") setURL({ a: S.la, b: S.lb });
		var tw = 0; for (var i = 1; i < list.length; i++) if (BigInt(list[i]) - BigInt(list[i - 1]) === 2n) tw++;
		$("pm-lsum").innerHTML = "<b>" + G(list.length) + " primes</b> from " + ns(a) + " to " + ns(b) + (list.length > 1 ? ", including " + G(tw) + " twin-prime pairs" : "") + "." + (list.length > 3000 ? " Showing the first 3,000; Copy list copies all of them." : "");
		$("pm-llist").innerHTML = list.slice(0, 3000).map(function (p) { return '<a href="?n=' + p + '" data-check="' + p + '">' + G(p) + "</a>"; }).join("");
	}
	var chData = null;
	function drawChart() {
		if (!inited.list || S.tab !== "list") return;
		root.querySelectorAll("#pm-chv button").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.v === S.chv); });
		var N = Number(S.chn); if (!chData || chData.N !== N) { chData = P.piSamples(N, 240); chData.N = N; }
		var box = $("pm-chart"), card = $("pm-ch-card"), full = card.classList.contains("mes-pfill"), W = Math.max(280, box.clientWidth), H = full ? Math.max(240, card.clientHeight - box.offsetTop - 60) : Math.round(Math.min(420, Math.max(240, W * 0.5)));
		var dk = dark(), ax = dk ? "#9aa4b2" : "#5b6573", gr = dk ? "#2b3138" : "#e5e7eb", c1 = dk ? "#4ade80" : "#15803d", c2 = dk ? "#60a5fa" : "#2563eb", c3 = dk ? "#fbbf24" : "#b45309";
		var L = 64, R = 16, T = 16, B = 34, pw = W - L - R, ph = H - T - B, s = "";
		function nice(m) { var e = Math.pow(10, Math.floor(Math.log10(m))), f = m / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; }
		if (S.chv === "count") {
			var pts = chData.pts, ymax = nice(Math.max(P.li(N), chData.count) * 1.02);
			function X(x) { return L + x / N * pw; } function Y(y) { return T + ph - y / ymax * ph; }
			for (var i = 0; i <= 5; i++) { var yv = ymax * i / 5; s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(yv) + '" y2="' + Y(yv) + '" stroke="' + gr + '"/><text x="' + (L - 6) + '" y="' + (Y(yv) + 4) + '" text-anchor="end" fill="' + ax + '">' + G(Math.round(yv)) + "</text>"; }
			for (i = 0; i <= 4; i++) { var xv = N * i / 4; s += '<text x="' + X(xv) + '" y="' + (H - 12) + '" text-anchor="' + (i === 0 ? "start" : i === 4 ? "end" : "middle") + '" fill="' + ax + '">' + G(Math.round(xv)) + "</text>"; }
			var p1 = "", p2 = "", p3 = "";
			pts.forEach(function (p, k) { var x = p[0]; p1 += (k ? "L" : "M") + X(x).toFixed(1) + " " + Y(p[1]).toFixed(1); if (x >= 3) { p2 += (p2 ? "L" : "M") + X(x).toFixed(1) + " " + Y(x / Math.log(x)).toFixed(1); p3 += (p3 ? "L" : "M") + X(x).toFixed(1) + " " + Y(P.li(x)).toFixed(1); } });
			s += '<path d="' + p3 + '" fill="none" stroke="' + c3 + '" stroke-width="2" stroke-dasharray="6 4"/><path d="' + p2 + '" fill="none" stroke="' + c2 + '" stroke-width="2" stroke-dasharray="2 3"/><path d="' + p1 + '" fill="none" stroke="' + c1 + '" stroke-width="2.5"/>';
			s += '<line id="pm-chx" x1="0" x2="0" y1="' + T + '" y2="' + (T + ph) + '" stroke="' + ax + '" stroke-dasharray="3 3" visibility="hidden"/>';
			box.innerHTML = '<div class="pm-ckey"><span style="--c:' + c1 + '">π(x) actual count</span><span class="pm-dot2" style="--c:' + c2 + '">x ÷ ln x</span><span class="pm-dash" style="--c:' + c3 + '">li(x)</span></div><svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Prime counting function chart">' + s + '</svg><div class="pm-tip" id="pm-chtip" hidden></div>';
			var svg = box.querySelector("svg"), tip = $("pm-chtip");
			svg.addEventListener("mousemove", function (e) {
				var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * W / r.width; if (x < L || x > W - R) { tip.hidden = true; return; }
				var xv = (x - L) / pw * N, best = pts[0]; pts.forEach(function (p) { if (Math.abs(p[0] - xv) < Math.abs(best[0] - xv)) best = p; });
				var ln = svg.querySelector("#pm-chx"); ln.setAttribute("x1", X(best[0])); ln.setAttribute("x2", X(best[0])); ln.setAttribute("visibility", "visible");
				tip.hidden = false; tip.innerHTML = "x = " + G(best[0]) + "<br>π(x) = <b>" + G(best[1]) + "</b><br>x ÷ ln x ≈ " + G(Math.round(best[0] / Math.log(Math.max(3, best[0])))) + "<br>li(x) ≈ " + G(Math.round(P.li(Math.max(2.1, best[0]))));
				tip.style.left = Math.min(r.width - 170, e.clientX - r.left + 14) + "px"; tip.style.top = (e.clientY - r.top + 30) + "px";
			});
			svg.addEventListener("mouseleave", function () { tip.hidden = true; svg.querySelector("#pm-chx").setAttribute("visibility", "hidden"); });
			$("pm-chinfo").innerHTML = "Up to " + G(N) + " there are <b>" + G(chData.count) + "</b> primes: about one in " + (N / chData.count).toFixed(1) + ". The Prime Number Theorem says π(x) grows like x ÷ ln x; the logarithmic integral li(x) is a much closer guess.";
		} else {
			var gaps = chData.gaps, keys = Object.keys(gaps).map(Number).sort(function (a, b) { return a - b; }), gmax = Math.max.apply(null, keys.map(function (k) { return gaps[k]; })), kmax = keys[keys.length - 1];
			var bw = pw / (kmax / 2 + 1), ym = nice(gmax);
			for (i = 0; i <= 4; i++) { var yy = T + ph - ph * i / 4; s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + gr + '"/><text x="' + (L - 6) + '" y="' + (yy + 4) + '" text-anchor="end" fill="' + ax + '">' + G(Math.round(ym * i / 4)) + "</text>"; }
			keys.forEach(function (k) {
				var x = L + (k === 1 ? 0 : k / 2) * bw, hgt = gaps[k] / ym * ph;
				s += '<rect x="' + (x + 1) + '" y="' + (T + ph - hgt) + '" width="' + Math.max(1, bw - 2) + '" height="' + hgt + '" fill="' + (k % 6 === 0 ? c3 : c2) + '"><title>gap ' + k + ": " + G(gaps[k]) + " times</title></rect>";
				if (bw > 16 || k % (bw > 7 ? 4 : 10) === 0 || k <= 2) s += '<text x="' + (x + bw / 2) + '" y="' + (H - 12) + '" text-anchor="middle" fill="' + ax + '">' + k + "</text>";
			});
			box.innerHTML = '<div class="pm-ckey"><span style="--c:' + c2 + '">gap size (how many times)</span><span style="--c:' + c3 + '">multiples of 6</span></div><svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="Prime gaps chart">' + s + "</svg>";
			var mg = chData.maxGap;
			$("pm-chinfo").innerHTML = "Gaps between neighbouring primes up to " + G(N) + ". The biggest is <b>" + mg[0] + '</b>, between <a href="?n=' + mg[1] + '" data-check="' + mg[1] + '">' + G(mg[1]) + "</a> and " + G(mg[2]) + ". There are " + G(chData.twins) + " twin primes (gap 2). Gaps that are multiples of 6 are unusually common, because every prime above 3 is 6k ± 1.";
		}
	}

	/* ---------- dark mode redraw, start ---------- */
	new MutationObserver(function () { if (S.tab === "spiral") drawSpiral(); if (S.tab === "list") drawChart(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
	$("pm-n").value = S.n; $("pm-g").value = S.g;
	showTab(S.tab);
	runCheck(); runGcd();
})();
