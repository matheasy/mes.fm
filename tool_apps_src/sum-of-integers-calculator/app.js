/* MES Sum of Integers & Series Calculator -- UI (exact maths in lib.js, global SUM). Modes, worked steps, term table, brute-force check.
 * State: localStorage "mes-sum-of-integers-calculator:v1"; links ?m=&n=&a=&b=&k=&d=&r=&l=&t=&x=&f=&inc=&inf=&mode2= */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("sm"); if (!root) return;
	var KEY = "mes-sum-of-integers-calculator:v1";
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }
	var G = SUM.group;
	var MODES = [
		["nat", "1 to n", { n: "100" }], ["range", "Any range a to b", { a: "5", b: "20" }], ["pow", "Squares, cubes, powers", { k: "2", a: "1", b: "10" }],
		["oddeven", "Odd or even numbers", { t: "odd", n: "10", x: "first" }], ["mult", "Multiples", { l: "3, 5", n: "1000", inc: "0" }],
		["arith", "Arithmetic series", { a: "2", d: "3", n: "10", x: "n" }], ["geom", "Geometric series", { a: "1", r: "2", n: "10", inf: "0" }],
		["spec", "Fibonacci & triangular", { t: "fib", n: "10" }], ["sigma", "Σ your formula", { f: "i^2 + 3i", a: "1", b: "10" }]
	];
	var q = new URLSearchParams(location.search), saved = sget(), fromLink = !!q.get("m");
	var S = { m: "nat", v: {} };
	MODES.forEach(function (m) { S.v[m[0]] = Object.assign({}, m[2]); });
	var sm = fromLink ? q.get("m") : saved.m; if (MODES.some(function (m) { return m[0] === sm; })) S.m = sm;
	if (!fromLink && saved.v) MODES.forEach(function (m) { if (saved.v[m[0]]) Object.keys(m[2]).forEach(function (k) { if (typeof saved.v[m[0]][k] === "string") S.v[m[0]][k] = saved.v[m[0]][k]; }); });
	if (fromLink) Object.keys(S.v[S.m]).forEach(function (k) { if (q.get(k) != null) S.v[S.m][k] = q.get(k).slice(0, 200); });

	function field(id, label, val, wide, ph) { return '<div class="tu-field' + (wide ? " tu-field--wide" : "") + '"><label for="sm-' + id + '">' + label + '</label><input id="sm-' + id + '" class="tu-input" data-k="' + id + '" type="text" inputmode="text" autocomplete="off" value="' + esc(val) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : "") + "></div>"; }
	function select(id, label, val, items) { return '<div class="tu-field"><label for="sm-' + id + '">' + label + '</label><select id="sm-' + id + '" class="tu-select" data-k="' + id + '">' + items.map(function (i) { return '<option value="' + i[0] + '"' + (i[0] === val ? " selected" : "") + ">" + i[1] + "</option>"; }).join("") + "</select></div>"; }
	function form() {
		var v = S.v[S.m], h = "";
		if (S.m === "nat") h = field("n", "n (add 1 + 2 + … + n)", v.n);
		else if (S.m === "range") h = field("a", "From (first integer)", v.a) + field("b", "To (last integer)", v.b);
		else if (S.m === "pow") h = '<div class="sm-chips">' + [["1", "Plain (1)"], ["2", "Squares"], ["3", "Cubes"], ["4", "Fourth powers"], ["5", "Fifth powers"]].map(function (c) { return '<button type="button" class="tu-chip" data-kk="' + c[0] + '" aria-pressed="' + (v.k === c[0]) + '">' + c[1] + "</button>"; }).join("") + "</div>" + field("k", "Power k (0 to " + SUM.MAXK + ")", v.k) + field("a", "From", v.a) + field("b", "To", v.b);
		else if (S.m === "oddeven") h = select("t", "Which numbers", v.t, [["odd", "Odd numbers (1, 3, 5, …)"], ["even", "Even numbers (2, 4, 6, …)"]]) + select("x", "Add", v.x, [["first", "the first n of them"], ["upto", "all of them up to N"]]) + field("n", v.x === "upto" ? "N (largest allowed value)" : "n (how many)", v.n);
		else if (S.m === "mult") h = field("l", "Multiples of (one or more numbers)", v.l, true, "e.g. 3, 5") + field("n", "Up to", v.n) + select("inc", "Does the limit count", v.inc, [["0", "No: below the limit"], ["1", "Yes: up to and including it"]]);
		else if (S.m === "arith") h = field("a", "First term a", v.a) + field("d", "Common difference d", v.d) + select("x", "I know", v.x, [["n", "the number of terms"], ["last", "the last term"]]) + field("n", v.x === "last" ? "Last term" : "Number of terms n", v.n);
		else if (S.m === "geom") h = field("a", "First term a", v.a) + field("r", "Common ratio r", v.r) + (v.inf === "1" ? "" : field("n", "Number of terms n", v.n)) + '<label class="sm-check"><input type="checkbox" data-k="inf" ' + (v.inf === "1" ? "checked" : "") + "> Go on forever (infinite series)</label>";
		else if (S.m === "spec") h = select("t", "Which sum", v.t, [["fib", "Fibonacci: F₁ + … + Fₙ"], ["tri", "Triangular numbers: T₁ + … + Tₙ (tetrahedral)"], ["sqr", "Squares (pyramidal numbers)"]]) + field("n", "n", v.n);
		else if (S.m === "sigma") h = field("f", "Formula in i", v.f, true, "e.g. i^2 + 3i, 1/i, 2^i") + field("a", "From i =", v.a) + field("b", "To i =", v.b) + '<p class="tu-note sm-note">Use i as the variable. + − × ÷ ^ ( ) and sqrt, abs, ln, log, exp, sin, cos, tan, floor, ceil, fact. For example 3i, 2(i+1), i!.</p>';
		$("sm-form").innerHTML = h;
	}
	$("sm-modes").innerHTML = MODES.map(function (m) { return '<button type="button" role="tab" data-m="' + m[0] + '" aria-selected="false">' + m[1] + "</button>"; }).join("");

	/* ---------- compute ---------- */
	function posInt(s, name, max) { var x = SUM.parseInt(s); if (x === null) throw new Error(name + " must be a whole number"); if (x < 0n) throw new Error(name + " cannot be negative"); if (max && x > max) throw new Error(name + " is too big (limit " + G(String(max)) + ")"); return x; }
	function anyInt(s, name) { var x = SUM.parseInt(s); if (x === null) throw new Error(name + " must be a whole number"); if (abs(x) > 10n ** 400n) throw new Error(name + " is too big"); return x; }
	function abs(x) { return x < 0n ? -x : x; }
	var BIG = 10n ** 300n;
	function formulaPow(k) { return { 1: "n(n+1)/2", 2: "n(n+1)(2n+1)/6", 3: "[n(n+1)/2]²", 4: "n(n+1)(2n+1)(3n²+3n−1)/30", 5: "n²(n+1)²(2n²+2n−1)/12" }[k] || "Faulhaber's formula (Bernoulli numbers)"; }
	function compute() {
		var v = S.v[S.m], r = { label: "Sum", steps: [], terms: null, check: null, sub: "" };
		function eq(t) { r.steps.push('<div class="sm-eq">' + esc(t) + "</div>"); } function p(t) { r.steps.push("<p>" + t + "</p>"); }
		if (S.m === "nat") {
			var n = posInt(v.n, "n", BIG); r.val = SUM.rangeSum(1n, n); r.label = "1 + 2 + … + " + G(n.toString());
			p("Pair the first and last, the second and second-last, and so on: every pair adds to n + 1, and there are n / 2 pairs."); eq("Sum = n(n+1)/2 = " + G(n.toString()) + " × " + G((n + 1n).toString()) + " ÷ 2");
			r.terms = function (i) { return BigInt(i); }; r.count = n; r.brute = function () { var t = 0n; for (var i = 1n; i <= n; i++) t += i; return t; };
		} else if (S.m === "range") {
			var a = anyInt(v.a, "From"), b = anyInt(v.b, "To"); if (b < a) throw new Error("“To” must not be smaller than “From”"); r.val = SUM.rangeSum(a, b); r.label = G(a.toString()) + " + … + " + G(b.toString()); var cnt = b - a + 1n;
			p("Add the first and last number, multiply by how many numbers there are, and halve it."); eq("Sum = (first + last) × count ÷ 2 = (" + G(a.toString()) + " + " + G(b.toString()) + ") × " + G(cnt.toString()) + " ÷ 2");
			r.terms = function (i) { return a + BigInt(i) - 1n; }; r.count = cnt; r.brute = function () { var t = 0n; for (var i = a; i <= b; i++) t += i; return t; };
		} else if (S.m === "pow") {
			var k = Number(posInt(v.k, "The power k", BigInt(SUM.MAXK))), a2 = anyInt(v.a, "From"), b2 = anyInt(v.b, "To"); if (b2 < a2) throw new Error("“To” must not be smaller than “From”");
			r.val = SUM.powRange(k, a2, b2); r.label = "Σ i" + (k === 1 ? "" : sup(k)) + " from " + G(a2.toString()) + " to " + G(b2.toString());
			p("For the first n whole numbers, the sum of k-th powers has a closed form" + (k <= 5 ? ":" : " (Faulhaber's formula, from Bernoulli numbers):")); eq("1" + sup(k) + " + 2" + sup(k) + " + … + n" + sup(k) + " = " + formulaPow(k));
			if (a2 > 1n || a2 < 0n) p("For a range, the calculator subtracts the sums up to the two ends" + (a2 < 0n ? ", using that a negative number to an " + (k % 2 ? "odd power stays negative and to an even power turns positive." : "even power is positive.") : ".")); else eq("Sum = S(" + G(b2.toString()) + ")" + (a2 === 0n ? "" : "") );
			var cn = b2 - a2 + 1n; r.terms = function (i) { return (a2 + BigInt(i) - 1n) ** BigInt(k); }; r.termText = function (i) { var b = a2 + BigInt(i) - 1n; return (b < 0n ? "(" + G(b.toString()) + ")" : G(b.toString())) + sup(k); }; r.count = cn; r.brute = function () { var t = 0n; for (var i = a2; i <= b2; i++) t += i ** BigInt(k); return t; };
			if (k === 0) r.sub = "k = 0 counts every term as 1 (0⁰ = 1).";
		} else if (S.m === "oddeven") {
			var odd = v.t === "odd", nn = posInt(v.n, v.x === "upto" ? "N" : "n", BIG), cnt2;
			if (v.x === "upto") { cnt2 = odd ? (nn + 1n) / 2n : nn / 2n; } else cnt2 = nn;
			r.val = odd ? SUM.oddSum(cnt2) : SUM.evenSum(cnt2); r.label = (odd ? "Odd" : "Even") + " numbers" + (v.x === "upto" ? " up to " + G(nn.toString()) : ": the first " + G(nn.toString()));
			if (v.x === "upto") p("There are " + G(cnt2.toString()) + " " + (odd ? "odd" : "even") + " numbers up to " + G(nn.toString()) + ".");
			eq(odd ? "1 + 3 + … + (2n−1) = n² = " + G(cnt2.toString()) + "²" : "2 + 4 + … + 2n = n(n+1) = " + G(cnt2.toString()) + " × " + G((cnt2 + 1n).toString()));
			r.terms = function (i) { return odd ? 2n * BigInt(i) - 1n : 2n * BigInt(i); }; r.count = cnt2; r.brute = function () { var t = 0n; for (var i = 1n; i <= cnt2; i++) t += odd ? 2n * i - 1n : 2n * i; return t; };
		} else if (S.m === "mult") {
			var ms = String(v.l).split(/[\s,;]+/).filter(Boolean).map(function (s) { var x = SUM.parseInt(s); if (x === null || x <= 0n) throw new Error("Multiples of: use positive whole numbers like 3, 5"); return x; });
			if (!ms.length) throw new Error("Type the number(s) whose multiples to add"); if (ms.length > 8) throw new Error("Use at most 8 numbers");
			var lim = posInt(v.n, "The limit", BIG), incl = v.inc === "1"; r.val = SUM.multiplesSum(ms, lim, incl); r.label = "Multiples of " + ms.join(" or ") + (incl ? " up to " : " below ") + G(lim.toString());
			p("Add the multiples of each number, then subtract the ones counted twice (multiples of the common multiple) so nothing is counted twice: inclusion–exclusion."); ms.forEach(function (m) { var L = lim - (incl ? 0n : 1n); var c = L < 1n ? 0n : L / m; p("Multiples of " + m + ": " + G(c.toString()) + " of them, adding to " + G((m * c * (c + 1n) / 2n).toString()) + "."); });
			r.brute = lim <= 2000000n ? function () { var t = 0n, L = lim - (incl ? 0n : 1n); for (var i = 1n; i <= L; i++) { for (var j = 0; j < ms.length; j++) if (i % ms[j] === 0n) { t += i; break; } } return t; } : null; r.count = lim;
		} else if (S.m === "arith") {
			var a1 = SUM.parseQ(v.a), d = SUM.parseQ(v.d), x = SUM.parseQ(v.n); if (!a1) throw new Error("First term: enter a number"); if (!d) throw new Error("Difference: enter a number"); if (!x) throw new Error("Enter the " + (v.x === "last" ? "last term" : "number of terms"));
			var nT; if (v.x === "last") { if (d.n === 0n) throw new Error("With a difference of 0 give the number of terms instead"); var nq = SUM.add(SUM.div(SUM.sub(x, a1), d), SUM.Q(1)); if (!SUM.isInt(nq) || nq.n < 1n) throw new Error("The last term is not in this series (" + SUM.qstr(a1) + ", " + SUM.qstr(SUM.add(a1, d)) + ", …)"); nT = nq.n; p("Number of terms: n = (last − first) ÷ d + 1 = " + G(nT.toString()) + "."); } else { if (!SUM.isInt(x) || x.n < 1n) throw new Error("The number of terms must be a whole number of at least 1"); nT = x.n; }
			if (nT > BIG) throw new Error("Too many terms"); r.q = SUM.arithmetic(a1, d, nT); var last = SUM.add(a1, SUM.mul(SUM.Q(nT - 1n), d)); r.label = "Arithmetic series, " + G(nT.toString()) + " terms";
			eq("Sum = n(2a + (n−1)d) ÷ 2 = " + G(nT.toString()) + " × (2 × " + SUM.qstr(a1) + " + " + G((nT - 1n).toString()) + " × " + SUM.qstr(d) + ") ÷ 2"); p("Last term: " + esc(SUM.qstr(last)) + ". Same as (first + last) × n ÷ 2.");
			r.terms = function (i) { return SUM.add(a1, SUM.mul(SUM.Q(BigInt(i) - 1n), d)); }; r.count = nT; r.isQ = true; r.brute = function () { var t = SUM.Q(0); for (var i = 1n; i <= nT; i++) t = SUM.add(t, SUM.add(a1, SUM.mul(SUM.Q(i - 1n), d))); return t; };
		} else if (S.m === "geom") {
			var ga = SUM.parseQ(v.a), gr = SUM.parseQ(v.r); if (!ga) throw new Error("First term: enter a number"); if (!gr) throw new Error("Ratio: enter a number, e.g. 2, 0.5 or 1/3");
			if (v.inf === "1") { var inf = SUM.geometricInfinite(ga, gr); r.label = "Infinite geometric series"; if (inf === null) { r.diverge = true; p("The series only settles on a value when the ratio is between −1 and 1. With r = " + esc(SUM.qstr(gr)) + " the terms do not shrink, so the sum grows without limit."); } else { r.q = inf; eq("Sum = a ÷ (1 − r) = " + SUM.qstr(ga) + " ÷ (1 − " + SUM.qstr(gr) + ")"); p("This works because |r| < 1, so the terms shrink toward zero."); } }
			else { var gn = posInt(v.n, "Number of terms", 100000n); if (gn < 1n) throw new Error("Use at least 1 term"); r.q = SUM.geometric(ga, gr, gn); r.label = "Geometric series, " + G(gn.toString()) + " terms"; eq(gr.n === gr.d ? "r = 1, so every term equals a: Sum = n × a" : "Sum = a(1 − rⁿ) ÷ (1 − r) = " + SUM.qstr(ga) + " × (1 − " + SUM.qstr(gr) + "^" + gn + ") ÷ (1 − " + SUM.qstr(gr) + ")"); r.terms = function (i) { return SUM.mul(ga, SUM.pow(gr, Number(i) - 1)); }; r.count = gn; r.isQ = true; r.brute = function () { var t = SUM.Q(0), c = ga; for (var i = 0n; i < gn; i++) { t = SUM.add(t, c); c = SUM.mul(c, gr); } return t; }; }
		} else if (S.m === "spec") {
			var sn = Number(posInt(v.n, "n", v.t === "fib" ? 100000n : BIG));
			if (v.t === "fib") { r.val = SUM.fibSum(sn); r.label = "F₁ + … + F" + sub(sn); p("The Fibonacci numbers 1, 1, 2, 3, 5, 8, … add up to one less than the number two places further on."); eq("F₁ + … + Fₙ = Fₙ₊₂ − 1 = F" + sub(sn + 2) + " − 1"); r.terms = function (i) { return SUM.fib(i); }; r.count = BigInt(sn); r.brute = function () { var t = 0n; for (var i = 1; i <= sn; i++) t += SUM.fib(i); return t; }; if (sn > 3000) r.brute = null; }
			else if (v.t === "tri") { var nb = BigInt(sn); r.val = SUM.tetrahedral(nb); r.label = "T₁ + … + T" + sub(sn) + " (tetrahedral number)"; p("Triangular numbers are 1, 3, 6, 10, … (1, 1+2, 1+2+3, …). Stacking them gives the tetrahedral numbers."); eq("Sum = n(n+1)(n+2) ÷ 6 = " + G(nb.toString()) + " × " + G((nb + 1n).toString()) + " × " + G((nb + 2n).toString()) + " ÷ 6"); r.terms = function (i) { return SUM.triangular(i); }; r.count = nb; r.brute = function () { var t = 0n; for (var i = 1n; i <= nb; i++) t += SUM.triangular(i); return t; }; }
			else { var nq2 = BigInt(sn); r.val = SUM.powSum(2, nq2); r.label = "1² + … + " + G(String(sn)) + "² (square pyramidal number)"; p("Squares stacked as layers of a pyramid."); eq("Sum = n(n+1)(2n+1) ÷ 6"); r.terms = function (i) { return BigInt(i) * BigInt(i); }; r.count = nq2; r.brute = function () { var t = 0n; for (var i = 1n; i <= nq2; i++) t += i * i; return t; }; }
		} else if (S.m === "sigma") {
			var sa = Number(v.a), sb = Number(v.b); if (!isFinite(sa) || sa !== Math.floor(sa) || !isFinite(sb) || sb !== Math.floor(sb)) throw new Error("From and To must be whole numbers"); if (sb < sa) throw new Error("“To” must not be smaller than “From”");
			var res = SUM.sigma(v.f, sa, sb); r.num = res.sum; r.label = "Σ " + v.f + ", i = " + sa + " to " + sb; r.sub = G(String(res.n)) + " terms" + (res.bad ? " (" + res.bad + " skipped because they were not numbers)" : "") + ". Computed in floating point, so about 15 digits are reliable.";
			p("Each value of i from " + sa + " to " + sb + " is put into the formula and the results are added (with compensated summation to keep rounding error small)."); r.firstNums = res.first;
		}
		return r;
	}
	function sup(k) { return String(k).split("").map(function (c) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c]; }).join(""); } function sub(k) { return String(k).split("").map(function (c) { return "₀₁₂₃₄₅₆₇₈₉"[+c]; }).join(""); }

	/* the label above the answer: the series itself, as many leading terms as fit on one line, then "+ … + last" (re-fitted on resize) */
	var mctx = document.createElement("canvas").getContext("2d");
	function termStr(r, i) {
		if (r.termText) return r.termText(i);
		var t = r.terms(i), x = r.isQ ? G(SUM.qstr(t)) : G(t.toString());
		return /^-/.test(x) ? "(" + x + ")" : x;
	}
	function setLabel(r) {
		var el = $("sm-label"); el.title = r.label;
		if (!r.terms || r.count === undefined || r.count < 1n) { el.classList.remove("sm-series"); el.textContent = r.label; return; }
		el.classList.add("sm-series");
		var cs = getComputedStyle(el); mctx.font = cs.fontWeight + " " + cs.fontSize + " " + cs.fontFamily;
		var avail = el.clientWidth || el.parentNode.clientWidth || 300, n = r.count <= 100000n ? Number(r.count) : Infinity, cap = 80, k;
		function build(kk) {
			if (n !== Infinity && kk >= n) { var all = []; for (var i = 1; i <= n; i++) all.push(termStr(r, i)); return all.join(" + "); }
			var head = []; for (var j = 1; j <= kk; j++) head.push(termStr(r, j));
			return head.join(" + ") + " + … + " + termStr(r, r.count);
		}
		var best = build(Math.min(2, n === Infinity ? 2 : n));
		for (k = 1; k <= cap; k++) {
			if (n !== Infinity && k > n) break;
			var cand = build(k); if (mctx.measureText(cand).width > avail) break; best = cand;
			if (n !== Infinity && k >= n) break;
		}
		el.textContent = best;
	}
		function render() {
		[].forEach.call($("sm-modes").children, function (b) { b.setAttribute("aria-selected", String(b.dataset.m === S.m)); });
		var r; try { r = compute(); } catch (e) { $("sm-val").textContent = "–"; $("sm-val").classList.remove("sm-long"); $("sm-label").textContent = "Sum"; $("sm-sub").textContent = e.message; $("sm-steps-card").hidden = true; $("sm-terms-card").hidden = true; return; }
		var text, long = false, exact = "";
		if (r.diverge) { text = "No finite sum"; exact = "diverges"; }
		else if (r.num !== undefined) { text = r.num === 0 ? "0" : (Math.abs(r.num) >= 1e15 || Math.abs(r.num) < 1e-4) ? r.num.toPrecision(15).replace(/\.?0+e/, "e") : G(String(parseFloat(r.num.toPrecision(15)))); exact = text; }
		else if (r.q) { var q = r.q, dec = SUM.qdec(q, 15); text = SUM.isInt(q) ? G(q.n.toString()) : SUM.qstr(q); exact = text; if (!SUM.isInt(q)) r.sub = "≈ " + dec; }
		else { text = G(r.val.toString()); exact = r.val.toString(); }
		var digits = text.replace(/[^0-9]/g, "").length; long = digits > 22 || text.length > 22;
		root._r = r; root._text = text; setLabel(r);
		$("sm-val").textContent = text; $("sm-val").classList.toggle("sm-long", long); 
		var subTxt = r.sub || ""; if (!r.q && r.val !== undefined && digits > 12) subTxt = digits + " digits" + (r.val > 10n ** 15n ? " ≈ " + sci(r.val) : "") + (subTxt ? " · " + subTxt : "");
		$("sm-sub").textContent = subTxt;
		/* steps + check */
		var steps = r.steps.slice();
		if (r.brute && r.count !== undefined && r.count <= 200000n) { try { var chk = r.brute(); var same = r.isQ ? SUM.qstr(chk) === SUM.qstr(r.q) : chk === r.val; steps.push('<p class="' + (same ? "sm-ok" : "") + '">' + (same ? "✓ Checked by adding all " + G(r.count.toString()) + " terms one by one: same answer." : "⚠ The brute-force check disagrees (" + esc(String(chk)) + "). Please report this.") + "</p>"); } catch (e) {} }
		$("sm-steps").innerHTML = steps.join(""); $("sm-steps-card").hidden = !steps.length;
		/* terms table */
		var rows = []; if (r.terms && r.count !== undefined && r.count >= 1n) {
			var cnt = r.count, show = cnt <= 12n ? Number(cnt) : 8, run = r.isQ ? SUM.Q(0) : 0n, i;
			function fmtT(t) { return r.isQ ? G(SUM.qstr(t)) : G(t.toString()); }
			for (i = 1; i <= show; i++) { var t = r.terms(i); run = r.isQ ? SUM.add(run, t) : run + t; rows.push("<tr><td>" + i + "</td><td>" + esc(fmtT(t)) + "</td><td>" + esc(fmtT(run)) + "</td></tr>"); }
			if (cnt > 12n) { rows.push('<tr><td colspan="3" class="tu-note">… ' + G((cnt - 9n).toString()) + " more terms …</td></tr>"); var lt = r.terms(cnt); rows.push("<tr><td>" + G(cnt.toString()) + "</td><td>" + esc(fmtT(lt)) + "</td><td><b>" + esc(text) + "</b></td></tr>"); }
		} else if (r.firstNums) { var run2 = 0; r.firstNums.forEach(function (x) { run2 += x[1]; rows.push("<tr><td>i = " + x[0] + "</td><td>" + esc(String(parseFloat(x[1].toPrecision(10)))) + "</td><td>" + esc(String(parseFloat(run2.toPrecision(12)))) + "</td></tr>"); }); }
		$("sm-terms").querySelector("tbody").innerHTML = rows.join(""); $("sm-terms-card").hidden = !rows.length;
		$("sm-terms-note").textContent = "";
		root._exact = exact; sset({ m: S.m, v: S.v });
	}
	function sci(b) { var s = b.toString(), e = s.length - 1; return s[0] + "." + s.slice(1, 5) + " × 10" + String(e).split("").map(function (c) { return "⁰¹²³⁴⁵⁶⁷⁸⁹"[+c]; }).join(""); }

	root.addEventListener("input", function (e) { var k = e.target.dataset && e.target.dataset.k; if (!k) return; S.v[S.m][k] = e.target.type === "checkbox" ? (e.target.checked ? "1" : "0") : e.target.value; render(); });
	root.addEventListener("change", function (e) { var k = e.target.dataset && e.target.dataset.k; if (!k) return; S.v[S.m][k] = e.target.type === "checkbox" ? (e.target.checked ? "1" : "0") : e.target.value; if (e.target.tagName === "SELECT" || e.target.type === "checkbox") { form(); render(); } });
	root.addEventListener("click", function (e) {
		var m = e.target.closest("[data-m]"); if (m) { S.m = m.dataset.m; form(); render(); return; }
		var kk = e.target.closest("[data-kk]"); if (kk) { S.v.pow.k = kk.dataset.kk; form(); render(); }
	});
	function toast(msg) { var t = $("sm-toast"); if (!t) { t = document.createElement("div"); t.id = "sm-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1800); }
	function copy(text, msg) { function ok() { toast(msg); } if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { prompt("Copy this:", text); }); else prompt("Copy this:", text); }
	$("sm-copy").onclick = function () { copy(root._exact || $("sm-val").textContent, "Result copied"); };
	$("sm-link").onclick = function () { var o = new URLSearchParams(); o.set("m", S.m); Object.keys(S.v[S.m]).forEach(function (k) { o.set(k, S.v[S.m][k]); }); copy(location.origin + location.pathname + "?" + o.toString(), "Link copied"); };
	form(); render();
	var rz; window.addEventListener("resize", function () { clearTimeout(rz); rz = setTimeout(function () { if (root._r) setLabel(root._r); }, 80); });
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rz); rz = setTimeout(function () { if (root._r) setLabel(root._r); }, 60); }).observe($("sm-label").parentNode);
	if (fromLink) history.replaceState(null, "", location.pathname);
})();
