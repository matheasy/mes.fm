/* MES Calculator UI (maths lives in lib.js, prepended above as MC) */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-calculator:v1';
	var state = { deg: true, hist: [], tab: 'muldiv', sci: true };
	try { var saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved) { for (var k in saved) if (k in state) state[k] = saved[k]; } } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }

	var expr = $('mc-expr'), live = $('mc-live'), ans = 0, lastText = '';
	var toastTimer;
	function toast(msg) { var t = $('mc-toast'); t.textContent = msg; t.classList.add('tu-toast--show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 1500); }
	function copy(text, msg) {
		function done() { toast(msg || 'Copied'); }
		if (navigator.clipboard && window.isSecureContext) { navigator.clipboard.writeText(text).then(done, fallback); } else fallback();
		function fallback() {
			var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
			ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } document.body.removeChild(ta);
		}
	}
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
	function stat(label, value, sub, hero) {
		return '<div class="tu-stat' + (hero ? ' tu-stat--hero' : '') + '"><div class="tu-stat__label">' + label + '</div><div class="tu-stat__value">' + value + '</div>' + (sub ? '<div class="tu-stat__sub">' + sub + '</div>' : '') + '</div>';
	}
	function note(msg) { return '<p class="tu-note" style="grid-column:1/-1;margin:0;">' + msg + '</p>'; }
	function num(id) { var v = String($(id).value).replace(/[,\s]/g, ''); if (v === '') return NaN; return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(v) ? parseFloat(v) : NaN; }
	function onInput(ids, fn) { ids.forEach(function (id) { $(id).addEventListener('input', fn); $(id).addEventListener('change', fn); }); }
	var G = MC.gfmt;

	/* ---------- main calculator ---------- */
	function compute(text) {
		try { return { v: MC.evaluate(text, { deg: state.deg, ans: ans }) }; } catch (e) { return { err: e.message }; }
	}
	function showLive() {
		var text = expr.value.trim();
		live.className = 'mc-live';
		if (!text) { live.innerHTML = '&nbsp;'; lastText = ''; return; }
		var r = compute(text);
		if (r.err) {
			// stay quiet while the person is still typing something unfinished
			if (/^(Unfinished|Unexpected “[)]”|Type an)/.test(r.err) || /[-+*/^×÷−(,]$/.test(text)) { live.className = 'mc-live is-dim'; live.innerHTML = '&nbsp;'; }
			else { live.className = 'mc-live is-err'; live.textContent = r.err; }
			lastText = ''; return;
		}
		lastText = G(r.v); live.textContent = '= ' + lastText;
	}
	function addHistory(e, r) {
		state.hist = state.hist.filter(function (h) { return h[0] !== e; });
		state.hist.unshift([e, r]); state.hist = state.hist.slice(0, 30); save(); renderHist();
	}
	function renderHist() {
		var ul = $('mc-hist'); $('mc-hist-card').hidden = !state.hist.length;
		ul.innerHTML = state.hist.map(function (h, i) { return '<li data-i="' + i + '" title="Click to reuse"><span class="mc-h-e">' + esc(h[0]) + '</span><span class="mc-h-r">= ' + esc(G(h[1])) + '</span></li>'; }).join('');
	}
	function equals() {
		var text = expr.value.trim(); if (!text) return;
		var r = compute(text);
		if (r.err) { showLive(); return; }
		ans = r.v; addHistory(text, r.v);
		expr.value = MC.fmt(r.v); live.className = 'mc-live'; live.textContent = '= ' + G(r.v); lastText = G(r.v);
		expr.dataset.fresh = '1';
	}
	function insert(s) {
		var fresh = expr.dataset.fresh === '1'; delete expr.dataset.fresh;
		if (fresh && /^[0-9.π(]|^[a-z]/i.test(s) && !/^(\^|!|%)/.test(s)) expr.value = '';   // typing a new number after "=" starts over; an operator continues the answer
		var a = expr.selectionStart == null ? expr.value.length : expr.selectionStart, b = expr.selectionEnd == null ? a : expr.selectionEnd;
		expr.value = expr.value.slice(0, a) + s + expr.value.slice(b);
		var p = a + s.length; try { expr.setSelectionRange(p, p); } catch (e) {}
		showLive();
		if (!window.matchMedia('(pointer: coarse)').matches) expr.focus();
	}
	$('mc-pad').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });   // keep the caret in the field
	$('mc-pad').addEventListener('click', function (e) {
		var b = e.target.closest('button'); if (!b) return;
		if (b.dataset.ins != null) { insert(b.dataset.ins); return; }
		var act = b.dataset.act;
		if (act === 'eq') equals();
		else if (act === 'clear') { expr.value = ''; delete expr.dataset.fresh; showLive(); }
		else if (act === 'back') {
			var a = expr.selectionStart == null ? expr.value.length : expr.selectionStart, z = expr.selectionEnd == null ? a : expr.selectionEnd;
			if (a === z && a > 0) a--; expr.value = expr.value.slice(0, a) + expr.value.slice(z); try { expr.setSelectionRange(a, a); } catch (e2) {} showLive();
		}
	});
	expr.addEventListener('input', function () { delete expr.dataset.fresh; showLive(); });
	expr.addEventListener('keydown', function (e) {
		if (e.key === 'Enter') { e.preventDefault(); equals(); }
		else if (e.key === 'Escape') { expr.value = ''; showLive(); }
	});
	$('mc-hist').addEventListener('click', function (e) { var li = e.target.closest('li'); if (!li) return; var h = state.hist[+li.dataset.i]; expr.value = h[0]; ans = h[1]; delete expr.dataset.fresh; showLive(); expr.focus(); });
	$('mc-hist-clear').addEventListener('click', function () { state.hist = []; save(); renderHist(); });
	$('mc-copy').addEventListener('click', function () { if (lastText) copy(lastText.replace(/,/g, ''), 'Result copied'); else toast('Nothing to copy yet'); });
	$('mc-link').addEventListener('click', function () {
		var u = location.origin + location.pathname + (expr.value.trim() ? '?q=' + encodeURIComponent(expr.value.trim()) : ''); copy(u, 'Link copied');
	});
	function setAngle() { Array.prototype.forEach.call($('mc-angle').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String((b.dataset.deg === '1') === state.deg)); }); }
	$('mc-angle').addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; state.deg = b.dataset.deg === '1'; save(); setAngle(); showLive(); });
	function setSci() { $('mc-sci').hidden = !state.sci; $('mc-sci-toggle').textContent = state.sci ? 'Hide scientific keys' : 'Show scientific keys'; $('mc-sci-toggle').setAttribute('aria-expanded', String(state.sci)); }
	$('mc-sci-toggle').addEventListener('click', function () { state.sci = !state.sci; save(); setSci(); });

	/* ---------- tabs ---------- */
	function setTab(name) {
		state.tab = name; save();
		Array.prototype.forEach.call($('mc-tabs').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.tab === name)); });
		Array.prototype.forEach.call(document.querySelectorAll('.mc-panel'), function (p) { p.hidden = p.id !== 'p-' + name; });
	}
	$('mc-tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });

	/* ---------- multiply & divide ---------- */
	function mulDiv() {
		var out = $('md-out'), a = MC.parseDec($('md-a').value), b = MC.parseDec($('md-b').value);
		if (!a || !b) { out.innerHTML = note('Enter two numbers.'); return; }
		var h = stat('A × B', esc(MC.group(MC.mulExact(a, b))), 'exact product', true);
		var sum = MC.addExact(a, b), diff = MC.addExact(a, { m: -b.m, s: b.s });
		var q;
		if (b.m === 0n) h += stat('A ÷ B', 'undefined', 'cannot divide by zero');
		else {
			q = MC.divExact(a, b, 30);
			var sub = q.repeating ? 'repeating decimal' + (q.cycle ? ' (cycle of ' + q.cycle + ')' : '') : q.exact ? 'exact' : 'first 30 digits';
			h += stat('A ÷ B', esc(q.text.indexOf('(') >= 0 || q.text.slice(-1) === '…' ? q.text : MC.group(q.text)), sub, true);
			if (a.s === 0 && b.s === 0) {
				var qq = a.m / b.m, rr = a.m % b.m;
				h += stat('Quotient &amp; remainder', esc(MC.group(qq.toString())) + ' r ' + esc(rr.toString()), esc(a.m + ' = ' + b.m + ' × ' + qq + (rr === 0n ? '' : ' + ' + rr)));
			}
		}
		h += stat('A + B', esc(MC.group(sum))) + stat('A − B', esc(MC.group(diff)));
		if (b.m !== 0n) { var pct = MC.divExact({ m: a.m * 100n, s: a.s }, b, 10); h += stat('A as a % of B', esc(pct.text) + '%'); }
		out.innerHTML = h;
	}
	function mulTable() {
		var n = MC.parseDec($('mt-n').value), k = Math.max(1, Math.min(100, parseInt($('mt-k').value, 10) || 12)), out = $('mt-out');
		if (!n) { out.innerHTML = ''; return; }
		var h = ''; for (var i = 1; i <= k; i++) h += '<div>' + esc(MC.group(MC.decToString(n.m, n.s))) + ' × ' + i + ' = <b>' + esc(MC.group(MC.mulExact(n, { m: BigInt(i), s: 0 }))) + '</b></div>';
		out.innerHTML = h;
	}
	onInput(['md-a', 'md-b'], mulDiv); onInput(['mt-n', 'mt-k'], mulTable);

	/* ---------- squares & roots ---------- */
	function squares() {
		var n = num('sq-n'), k = num('sq-k'), out = $('sq-out');
		if (n !== n) { out.innerHTML = note('Enter a number.'); return; }
		var h = stat('n²', G(n * n), 'n × n', true) + stat('n³', G(n * n * n), 'n × n × n', true);
		var sqrtTxt = n >= 0 ? G(Math.sqrt(n)) : G(Math.sqrt(-n)) + ' i', sub = '';
		if (n >= 0 && Number.isInteger(n) && n <= 9007199254740991) {
			var s = Math.round(Math.sqrt(n));
			if (s * s === n) sub = 'a perfect square (' + G(s) + ' × ' + G(s) + ')';
			else if (n > 1) { var r = MC.radical(n); if (r.out > 1) sub = 'simplified: ' + r.out + '√' + r.inside; else sub = 'already in simplest radical form'; }
		} else if (n < 0) sub = 'imaginary: ' + G(Math.sqrt(-n)) + 'i';
		h += stat('Square root √n', esc(sqrtTxt), esc(sub)) + stat('Cube root ∛n', G(Math.cbrt(n)));
		h += stat('Reciprocal 1/n', n === 0 ? 'undefined' : G(1 / n));
		if (k === k) {
			h += stat('n to the power ' + esc(G(k)), G(Math.pow(n, k)), 'nⁿ with n = ' + esc(G(k)));
			var rt = (n < 0 && k % 2 !== 0) ? -Math.pow(-n, 1 / k) : Math.pow(n, 1 / k);
			h += stat(esc(G(k)) + '-th root of n', k === 0 ? 'undefined' : G(rt));
		}
		out.innerHTML = h;
	}
	onInput(['sq-n', 'sq-k'], squares);
	(function () {
		var rows = ''; for (var i = 1; i <= 25; i++) rows += '<tr><td>' + i + '</td><td>' + i * i + '</td><td>' + i * i * i + '</td><td>' + MC.fmt(Math.sqrt(i)) + '</td><td>' + MC.fmt(Math.cbrt(i)) + '</td></tr>';
		$('sq-table').querySelector('tbody').innerHTML = rows;
	})();

	/* ---------- powers & logs ---------- */
	function powers() {
		var b = num('pw-b'), e = num('pw-e'), out = $('pw-out');
		if (b !== b || e !== e) { out.innerHTML = note('Enter a base and an exponent.'); return; }
		var p = Math.pow(b, e);
		var h = stat(esc(G(b)) + ' ^ ' + esc(G(e)), p === p ? G(p) : 'not a real number', '', true);
		if (Number.isInteger(b) && Number.isInteger(e) && e >= 0 && e <= 2000 && Math.abs(b) < 1e6) h += stat('Exact value', esc(MC.group(((BigInt(b)) ** BigInt(e)).toString().slice(0, 400))), 'whole-number power, no rounding');
		h += stat('e ^ ' + esc(G(e)), G(Math.exp(e))) + stat('10 ^ ' + esc(G(e)), G(Math.pow(10, e))) + stat('2 ^ ' + esc(G(e)), G(Math.pow(2, e)));
		out.innerHTML = h;
	}
	function logs() {
		var y = num('lg-y'), b = num('lg-b'), out = $('lg-out');
		if (y !== y) { out.innerHTML = note('Enter a value.'); return; }
		if (y <= 0) { out.innerHTML = note('Logarithms need a positive value.'); return; }
		var h = '';
		if (b === b && b > 0 && b !== 1) h += stat('log base ' + esc(G(b)) + ' of ' + esc(G(y)), G(Math.log(y) / Math.log(b)), '', true);
		h += stat('ln (base e)', G(Math.log(y)), '', !(b === b && b > 0 && b !== 1)) + stat('log₁₀', G(Math.log10(y))) + stat('log₂', G(Math.log2(y)));
		var ex = Math.floor(Math.log10(y)), man = y / Math.pow(10, ex), eng = Math.floor(ex / 3) * 3;
		h += stat('Scientific notation', esc(MC.fmt(man) + ' × 10^' + ex), 'e-notation: ' + esc(MC.fmt(y).indexOf('e') >= 0 ? MC.fmt(y) : MC.fmt(man) + 'e' + ex));
		h += stat('Engineering notation', esc(MC.fmt(y / Math.pow(10, eng)) + ' × 10^' + eng), 'exponent is a multiple of 3');
		out.innerHTML = h;
	}
	onInput(['pw-b', 'pw-e'], powers); onInput(['lg-y', 'lg-b'], logs);

	/* ---------- fractions ---------- */
	function big(id) { var v = $(id).value.replace(/[,\s]/g, ''); return /^[-+]?\d+$/.test(v) ? BigInt(v) : null; }
	function fractions() {
		var an = big('fr-an'), ad = big('fr-ad'), bn = big('fr-bn'), bd = big('fr-bd'), op = $('fr-op').value, out = $('fr-out');
		if (an === null || ad === null || bn === null || bd === null) { out.innerHTML = note('Use whole numbers for the numerators and denominators.'); return; }
		if (ad === 0n || bd === 0n) { out.innerHTML = note('A denominator cannot be 0.'); return; }
		var A = MC.frac(an, ad), B = MC.frac(bn, bd), R;
		if (op === '+') R = MC.frac(A.n * B.d + B.n * A.d, A.d * B.d);
		else if (op === '-') R = MC.frac(A.n * B.d - B.n * A.d, A.d * B.d);
		else if (op === '*') R = MC.frac(A.n * B.n, A.d * B.d);
		else { if (B.n === 0n) { out.innerHTML = note('Cannot divide by zero.'); return; } R = MC.frac(A.n * B.d, A.d * B.n); }
		var dec = MC.divExact({ m: R.n, s: 0 }, { m: R.d, s: 0 }, 20);
		var h = stat('Result', esc(MC.fracToString(R)), 'simplified', true);
		var mixed = MC.fracMixed(R); if (mixed) h += stat('Mixed number', esc(mixed));
		h += stat('Decimal', esc(dec.text), dec.repeating ? 'repeating' : '') + stat('Percent', esc(MC.divExact({ m: R.n * 100n, s: 0 }, { m: R.d, s: 0 }, 10).text) + '%');
		out.innerHTML = h;
	}
	function decFrac() {
		var s = $('df-x').value.trim(), out = $('df-out'), f = MC.decToFrac(s);
		if (!f) { out.innerHTML = note('Enter a decimal such as 0.375 or 2.5.'); return; }
		var h = stat('Exact fraction', esc(MC.fracToString(f)), 'from the digits you typed', true), mixed = MC.fracMixed(f);
		if (mixed) h += stat('Mixed number', esc(mixed));
		var x = parseFloat(s.replace(/,/g, '')), ap = MC.approxFrac(x, 1000);
		if (ap && MC.fracToString(ap) !== MC.fracToString(f)) h += stat('Closest simple fraction', esc(MC.fracToString(ap)), 'denominator up to 1000 (0.333333 → 1/3)');
		out.innerHTML = h;
	}
	onInput(['fr-an', 'fr-ad', 'fr-bn', 'fr-bd', 'fr-op'], fractions); onInput(['df-x'], decFrac);

	/* ---------- factors & primes ---------- */
	function factors() {
		var v = $('fa-n').value.replace(/[,\s]/g, ''), out = $('fa-out');
		if (!/^\d+$/.test(v)) { out.innerHTML = note('Enter a whole number (1 or more).'); return; }
		var n = Number(v);
		if (n < 1) { out.innerHTML = note('Enter a whole number (1 or more).'); return; }
		if (n > 9007199254740991) { out.innerHTML = note('That is too large — try a number below 9,007,199,254,740,991.'); return; }
		var f = n > 1 ? MC.factorize(n) : [], prime = f.length === 1 && f[0][1] === 1;
		var h = stat('Is it prime?', n === 1 ? 'Neither' : prime ? 'Yes' : 'No', n === 1 ? '1 is neither prime nor composite' : prime ? esc(G(n)) + ' is a prime number' : 'composite number', true);
		if (n > 1) h += stat('Prime factorization', esc(f.map(function (pe) { return pe[1] > 1 ? pe[0] + '^' + pe[1] : pe[0]; }).join(' × ')), f.length ? esc(f.map(function (pe) { return Array(pe[1] + 1).join(pe[0] + ' × '); }).join('').replace(/ × $/, '')) : '');
		if (n <= 1e12) {
			var d = MC.divisors(n), sum = d.reduce(function (s, x) { return s + x; }, 0);
			h += stat('Number of factors', String(d.length), 'sum of factors: ' + esc(G(sum)));
			h += stat('All factors', '<span style="font-size:0.6em;font-weight:400;line-height:1.5;">' + esc(d.slice(0, 200).map(G).join(', ') + (d.length > 200 ? ', …' : '')) + '</span>');
			var s = Math.round(Math.sqrt(n)); h += stat('Perfect square?', s * s === n ? 'Yes (' + G(s) + '²)' : 'No', n > 1 && s * s !== n ? '√' + esc(G(n)) + ' = ' + (MC.radical(n).out > 1 ? MC.radical(n).out + '√' + MC.radical(n).inside : '√' + MC.radical(n).inside) : '');
		}
		out.innerHTML = h;
	}
	function gcdLcm() {
		var a = MC.parseList($('gl-list').value).filter(function (x) { return Number.isInteger(x) && x > 0 && x <= 9007199254740991; }), out = $('gl-out');
		if (a.length < 2) { out.innerHTML = note('Enter at least two positive whole numbers.'); return; }
		var g = a.reduce(MC.gcd), l = a.reduce(MC.lcm);
		out.innerHTML = stat('GCD (greatest common divisor)', G(g), 'also called HCF', true) + stat('LCM (least common multiple)', l > 9007199254740991 ? 'too large' : G(l), '', true);
	}
	onInput(['fa-n'], factors); onInput(['gl-list'], gcdLcm);

	/* ---------- bases & roman ---------- */
	function bases() {
		var out = $('bs-out'), from = parseInt($('bs-from').value, 10), v = MC.parseBase($('bs-v').value, from), to = parseInt($('bs-to').value, 10);
		if (v === null) { out.innerHTML = note('That is not a valid base-' + from + ' number.'); return; }
		var h = stat('Decimal', esc(MC.group(v.toString())), '', true) + stat('Binary', '<span style="font-size:0.7em;">' + esc(MC.toBase(v, 2)) + '</span>') + stat('Octal', esc(MC.toBase(v, 8))) + stat('Hexadecimal', esc(MC.toBase(v, 16).toUpperCase()));
		if (to >= 2 && to <= 36) h += stat('Base ' + to, esc(MC.toBase(v, to).toUpperCase()));
		out.innerHTML = h;
	}
	function roman() {
		var s = $('ro-v').value.trim(), out = $('ro-out');
		if (/^\d+$/.test(s)) { var r = MC.toRoman(parseInt(s, 10)); out.innerHTML = r ? stat('Roman numeral', esc(r), '', true) : note('Roman numerals cover 1 to 3999.'); }
		else if (s) { var n = MC.fromRoman(s); out.innerHTML = n ? stat('Number', String(n), esc(s.toUpperCase()), true) : note('That is not a standard Roman numeral.'); }
		else out.innerHTML = '';
	}
	onInput(['bs-v', 'bs-from', 'bs-to'], bases); onInput(['ro-v'], roman);

	/* ---------- list statistics ---------- */
	function listStats() {
		var a = MC.parseList($('st-list').value), out = $('st-out');
		if (!a.length) { out.innerHTML = note('Enter some numbers.'); return; }
		var s = MC.stats(a);
		var h = stat('Mean (average)', G(s.mean), 'sum ÷ count', true) + stat('Median', G(s.median), '', true) + stat('Mode', s.mode.length ? esc(s.mode.map(G).join(', ')) : 'none', s.mode.length ? '' : 'no value repeats');
		h += stat('Count', String(s.n)) + stat('Sum', G(s.sum)) + stat('Product', G(s.product)) + stat('Minimum', G(s.min)) + stat('Maximum', G(s.max)) + stat('Range', G(s.range));
		h += stat('Std. deviation (population)', G(s.sdPop), 'variance ' + G(s.varPop)) + (s.n > 1 ? stat('Std. deviation (sample)', G(s.sdSample), 'variance ' + G(s.varSample)) : '');
		h += stat('Sorted', '<span style="font-size:0.6em;font-weight:400;line-height:1.5;">' + esc(s.sorted.slice(0, 200).map(G).join(', ')) + '</span>');
		out.innerHTML = h;
	}
	onInput(['st-list'], listStats);

	/* ---------- start-up ---------- */
	var q = new URLSearchParams(location.search);
	if (q.get('q')) expr.value = q.get('q').slice(0, 500);
	var wantTab = q.get('tab'); if (wantTab && $('p-' + wantTab)) state.tab = wantTab;
	setAngle(); setSci(); renderHist(); setTab(state.tab);
	mulDiv(); mulTable(); squares(); powers(); logs(); fractions(); decFrac(); factors(); gcdLcm(); bases(); roman(); listStats(); showLive();
})();
