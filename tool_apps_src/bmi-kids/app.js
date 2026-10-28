/* MES BMI Calculator for Kids and Teens: UI. Maths = KB (lib.js) + CDC_BMI (data.js), both prepended. */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); }, KEY = 'mes-bmi-kids:v1';
	var S = { sex: 'f', mode: 'age', y: '', m: '0', birth: '', on: '', kg: '', cm: '' };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('kb-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2000); }
	function num(v) { v = String(v || '').trim().replace(/\s/g, ''); if (/^\d+,\d+$/.test(v)) v = v.replace(',', '.'); var x = parseFloat(v); return isFinite(x) && x > 0 ? x : null; }
	function r(x, d) { var f = Math.pow(10, d); return String(Math.round(x * f) / f); }
	function day(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000) : null; }
	function todayIso() { var n = new Date(); return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2); }
	var NAMES = { under: 'Underweight', healthy: 'Healthy weight', over: 'Overweight', obese: 'Obesity', severe: 'Severe obesity' };
	var TEXT = {
		under: 'This BMI is below the 5th percentile for this age and sex. Some children are naturally slim and grow well, but it is worth mentioning to your child\'s doctor, who can check their growth over time and that they are getting enough to eat for growing.',
		healthy: 'This BMI is in the healthy weight range for this age and sex. Keep up the everyday basics: regular meals together, active play and enough sleep.',
		over: 'This BMI is in the overweight range for this age and sex (85th to less than the 95th percentile). BMI is a screening number, not a diagnosis: a doctor can tell whether it reflects body fat, muscle or a growth spurt. Small habits the whole family shares help more than any diet.',
		obese: 'This BMI is at or above the 95th percentile for this age and sex, in the range the CDC calls obesity. That is a good reason to talk with your child\'s doctor, who can look at the whole picture and suggest support for the family. Children should not be put on a weight-loss diet without medical advice.',
		severe: 'This BMI is at least 120% of the 95th percentile for this age and sex, the range the CDC calls severe obesity. Please talk with your child\'s doctor: there are family programs and treatments that help, and a doctor can check for anything that needs care. Children should not be put on a weight-loss diet without medical advice.'
	};
	// ---------- inputs ----------
	(function () {
		var y = '<option value="">--</option>', m = '';
		for (var i = 2; i <= 19; i++) y += '<option value="' + i + '">' + i + '</option>';
		for (var j = 0; j <= 11; j++) m += '<option value="' + j + '">' + j + '</option>';
		$('kb-y').innerHTML = y; $('kb-m').innerHTML = m;
	})();
	function seg(id, val) { Array.prototype.forEach.call($(id).querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === val)); }); }
	function segClick(id, fn) { $(id).addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; seg(id, b.getAttribute('data-v')); fn(b.getAttribute('data-v')); }); }
	segClick('kb-sex', function (v) { S.sex = v; exp = null; update(); });
	segClick('kb-mode', function (v) { S.mode = v; showMode(); update(); });
	function showMode() { $('kb-agerow').hidden = S.mode !== 'age'; $('kb-daterow').hidden = S.mode !== 'dates'; }
	['kb-y', 'kb-m', 'kb-birth', 'kb-on'].forEach(function (id) { $(id).addEventListener('change', update); $(id).addEventListener('input', update); });
	function fillFromKg() { var kg = num($('kb-kg').value); $('kb-lb').value = kg == null ? '' : r(KB.kgToLb(kg), 1); }
	function fillFromCm() { var cm = num($('kb-cm').value); if (cm == null) { $('kb-ft').value = ''; $('kb-in').value = ''; return; } var f = KB.cmToFtIn(cm); $('kb-ft').value = f[0]; $('kb-in').value = r(f[1], 1); }
	$('kb-kg').addEventListener('input', function () { fillFromKg(); update(); });
	$('kb-lb').addEventListener('input', function () { var lb = num($('kb-lb').value); $('kb-kg').value = lb == null ? '' : r(KB.lbToKg(lb), 2); update(); });
	$('kb-cm').addEventListener('input', function () { fillFromCm(); update(); });
	function fromFtIn() { var f = parseFloat($('kb-ft').value) || 0, i = num($('kb-in').value) || 0; $('kb-cm').value = f * 12 + i > 0 ? r(KB.ftInToCm(f, i), 1) : ''; update(); }
	$('kb-ft').addEventListener('input', fromFtIn); $('kb-in').addEventListener('input', fromFtIn);
	$('kb-clear').onclick = function () { ['kb-kg', 'kb-lb', 'kb-cm', 'kb-ft', 'kb-in', 'kb-birth'].forEach(function (id) { $(id).value = ''; }); $('kb-y').value = ''; $('kb-m').value = '0'; $('kb-on').value = todayIso(); exp = null; update(); toast('Cleared'); };
	// a few examples to try (made-up children)
	var EX = [['f', 6, 3, 21, 116], ['m', 10, 0, 34, 140], ['f', 14, 6, 50, 160], ['m', 17, 2, 70, 178]];
	$('kb-examples').innerHTML = EX.map(function (e, i) { return '<button type="button" class="tu-chip" data-ex="' + i + '">' + (e[0] === 'f' ? 'Girl' : 'Boy') + ', ' + e[1] + '</button>'; }).join('');
	$('kb-examples').addEventListener('click', function (ev) {
		var b = ev.target.closest('[data-ex]'); if (!b) return; var e = EX[+b.getAttribute('data-ex')];
		S.sex = e[0]; seg('kb-sex', S.sex); S.mode = 'age'; seg('kb-mode', 'age'); showMode(); $('kb-y').value = e[1]; $('kb-m').value = e[2];
		$('kb-kg').value = e[3]; fillFromKg(); $('kb-cm').value = e[4]; fillFromCm(); exp = null; update();
	});
	// ---------- results ----------
	var cur = null, exp = null;
	function ageMonths() {
		if (S.mode === 'age') { if ($('kb-y').value === '') return { err: '' }; return { m: KB.monthsFromYM(+$('kb-y').value, +$('kb-m').value) }; }
		var b = day($('kb-birth').value), o = day($('kb-on').value);
		if (b == null || o == null) return { err: '' }; if (o < b) return { err: 'The measurement date is before the birth date.' };
		return { m: KB.monthsFromDays(o - b) };
	}
	function update() {
		S.y = $('kb-y').value; S.m = $('kb-m').value; S.birth = $('kb-birth').value; S.on = $('kb-on').value; S.kg = $('kb-kg').value.trim(); S.cm = $('kb-cm').value.trim(); save();
		var a = ageMonths(), kg = num($('kb-kg').value), cm = num($('kb-cm').value), msg = '';
		cur = null;
		if (a.err) msg = a.err;
		else if (a.m != null) {
			var chk = KB.ageCheck(a.m);
			if (chk) msg = chk + (a.m < KB.MIN ? ' <a href="/baby-growth-percentile-calculator">Baby Growth Percentile Calculator &rarr;</a>' : ' <a href="/bmicalculator">Adult BMI Calculator &rarr;</a>');
			else if (kg != null && cm != null) {
				if (cm < 70 || cm > 230) msg = 'Check the height: that looks unlikely for a child or teen. Is the unit right?';
				else if (kg < 7 || kg > 250) msg = 'Check the weight: that looks unlikely for a child or teen. Is the unit right?';
				else cur = { months: a.m, kg: kg, cm: cm, A: KB.analyse(S.sex, a.m, kg, cm) };
			}
		}
		$('kb-msg').innerHTML = msg; $('kb-out').hidden = !cur; $('kb-empty').hidden = !!cur; $('kb-refbox').hidden = !cur;
		if (cur) render();
		drawChart();
	}
	function sexWord() { return S.sex === 'm' ? 'boys' : 'girls'; }
	function render() {
		var A = cur.A, c = A.cat;
		$('kb-hero').innerHTML =
			'<div class="tu-stat tu-stat--hero"><div class="tu-stat__label">BMI-for-age percentile</div><div class="tu-stat__value">' + esc(KB.pctText(A.pct)) + '</div><div class="tu-stat__sub">among ' + sexWord() + ' aged ' + esc(KB.ageText(cur.months)) + '</div></div>' +
			'<div class="tu-stat"><div class="tu-stat__label">Category</div><div class="tu-stat__value kb-cat kb-cat--' + c + '">' + NAMES[c] + '</div><div class="tu-stat__sub">' + esc(KB.CATS[c].range) + '</div></div>' +
			'<div class="tu-stat"><div class="tu-stat__label">BMI</div><div class="tu-stat__value">' + A.bmi.toFixed(1) + '</div><div class="tu-stat__sub">kg/m&sup2; &middot; ' + r(cur.kg, 2) + ' kg (' + r(KB.kgToLb(cur.kg), 1) + ' lb), ' + r(cur.cm, 1) + ' cm (' + ftin(cur.cm) + ')</div></div>';
		var extra = '';
		if (A.pct >= 85) extra = '<p class="kb-p95">BMI is <b>' + Math.round(A.pctOf95) + '%</b> of the 95th percentile (' + A.p95.toFixed(1) + ') for this age' + (A.cls3 ? ', which is in the range sometimes called class 3 (140% or more).' : '.') + '</p>';
		$('kb-verdict').innerHTML = '<p>' + TEXT[c] + '</p>' + extra;
		$('kb-verdict').className = 'tu-card kb-verdict kb-verdict--' + c;
		// percentile bar: 0-100 with the 5 / 85 / 95 marks
		var pos = Math.max(0.5, Math.min(99.5, A.pct));
		$('kb-bar').innerHTML = '<div class="kb-bar__track"><span class="kb-z kb-z--under" style="width:5%"></span><span class="kb-z kb-z--healthy" style="width:80%"></span><span class="kb-z kb-z--over" style="width:10%"></span><span class="kb-z kb-z--obese" style="width:5%"></span><span class="kb-bar__pin" style="left:' + pos + '%"></span></div>' +
			'<div class="kb-bar__ticks"><span style="left:5%">5th</span><span style="left:50%">50th</span><span style="left:85%">85th</span><span style="left:95%">95th</span></div>';
		var rows = [['5th percentile', A.p5, 'Below this: underweight'], ['50th percentile (median)', A.p50, 'Half of ' + sexWord() + ' this age are below'], ['85th percentile', A.p85, 'From here: overweight'], ['95th percentile', A.p95, 'From here: obesity'], ['120% of the 95th', A.sev, 'From here: severe obesity']];
		$('kb-ref').innerHTML = '<tr><th>Line</th><th>BMI</th><th>Meaning</th></tr>' + rows.map(function (x) { return '<tr' + (x[1] <= A.bmi && (x === rows[rows.length - 1] || rows[rows.indexOf(x) + 1][1] > A.bmi) ? ' class="kb-here"' : '') + '><td>' + x[0] + '</td><td>' + x[1].toFixed(1) + '</td><td>' + x[2] + '</td></tr>'; }).join('');
		$('kb-refnote').textContent = 'For ' + sexWord() + ' aged ' + KB.ageText(cur.months) + ' (CDC). Children are still growing, so a doctor looks at the trend over time rather than at one weight.';
	}
	function ftin(cm) { var f = KB.cmToFtIn(cm); return f[0] + '′ ' + r(f[1], 1) + '″'; }
	$('kb-copy').onclick = function () {
		if (!cur) return; var A = cur.A;
		var t = 'BMI-for-age: ' + KB.pctText(A.pct) + ' percentile (' + NAMES[A.cat] + ')\nBMI ' + A.bmi.toFixed(1) + ', ' + (S.sex === 'm' ? 'boy' : 'girl') + ', age ' + KB.ageText(cur.months) + '\n' + r(cur.kg, 2) + ' kg, ' + r(cur.cm, 1) + ' cm\n(CDC growth charts, mes.fm/bmi-calculator-kids)';
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).then(function () { toast('Copied'); }, function () { toast('Could not copy'); }); else toast('Could not copy');
	};
	$('kb-print').onclick = function () { window.print(); };
	// ---------- chart: BMI-for-age curves with the child's point; "Try other numbers" drags the point ----------
	var LINES = [5, 10, 25, 50, 75, 85, 90, 95];
	function chartGeom() {
		var box = $('kb-chart'), narrow = !!(box.clientWidth && box.clientWidth < 520), W = narrow ? 400 : 640, H = narrow ? 470 : 420, L = narrow ? 34 : 40, R = narrow ? 32 : 46, T = 12, B = 34;
		var ymin = 12, ymax = 36, pts = [];
		if (cur) pts.push(cur.A.bmi); if (exp) pts.push(exp.bmi);
		if (exp && exp.R) { ymin = exp.R[0]; ymax = exp.R[1]; }
		else pts.forEach(function (b) { if (b > ymax - 1) ymax = Math.min(60, Math.ceil((b + 3) / 2) * 2); if (b < ymin + 0.5) ymin = Math.max(8, Math.floor(b - 1)); });
		return { narrow: narrow, W: W, H: H, L: L, R: R, T: T, B: B, ymin: ymin, ymax: ymax, X: function (mo) { return L + (mo - 24) / 216 * (W - L - R); }, Y: function (b) { return T + (1 - (b - ymin) / (ymax - ymin)) * (H - T - B); } };
	}
	function drawChart() {
		var g = chartGeom(), X = g.X, Y = g.Y, s = S.sex, svg = '', mo, i;
		function curve(f) { var p = ''; for (mo = 24; mo <= 240; mo += 2) p += (mo === 24 ? 'M' : 'L') + X(mo).toFixed(1) + ' ' + Y(Math.max(g.ymin - 2, Math.min(g.ymax + 2, f(mo)))).toFixed(1); return p; }
		function area(f1, f2, cls) { var p = '', q = ''; for (mo = 24; mo <= 240; mo += 2) { p += (mo === 24 ? 'M' : 'L') + X(mo).toFixed(1) + ' ' + Y(clampY(f1(mo))).toFixed(1); } for (mo = 240; mo >= 24; mo -= 2) q += 'L' + X(mo).toFixed(1) + ' ' + Y(clampY(f2(mo))).toFixed(1); return '<path class="kb-reg kb-reg--' + cls + '" d="' + p + q + 'Z"/>'; }
		function clampY(b) { return Math.max(g.ymin, Math.min(g.ymax, b)); }
		var lo = function () { return g.ymin; }, hi = function () { return g.ymax; };
		var f5 = function (m) { return KB.bmiAt(s, m, 5); }, f85 = function (m) { return KB.bmiAt(s, m, 85); }, f95 = function (m) { return KB.p95(s, m); }, f120 = function (m) { return 1.2 * KB.p95(s, m); };
		svg += '<svg class="kb-svg' + (exp ? ' is-live' : '') + '" viewBox="0 0 ' + g.W + ' ' + g.H + '" role="img" aria-label="CDC BMI-for-age chart for ' + sexWord() + ' aged 2 to 20' + (cur ? ', with the child\'s BMI marked' : '') + '">';
		svg += '<defs><clipPath id="kb-clip"><rect x="' + g.L + '" y="' + g.T + '" width="' + (g.W - g.L - g.R) + '" height="' + (g.H - g.T - g.B) + '"/></clipPath></defs><g clip-path="url(#kb-clip)">';
		svg += area(lo, f5, 'under') + area(f5, f85, 'healthy') + area(f85, f95, 'over') + area(f95, f120, 'obese') + area(f120, hi, 'severe') + '</g>';
		for (var yr = 2; yr <= 20; yr++) { var x = X(yr * 12); svg += '<line class="kb-gl" x1="' + x + '" y1="' + g.T + '" x2="' + x + '" y2="' + (g.H - g.B) + '"/>' + (yr % 2 === 0 || !g.narrow ? '<text class="kb-ct" x="' + x + '" y="' + (g.H - g.B + 15) + '" text-anchor="middle">' + yr + '</text>' : ''); }
		svg += '<text class="kb-ct kb-axt" x="' + ((g.L + g.W - g.R) / 2) + '" y="' + (g.H - 3) + '" text-anchor="middle">Age (years)</text>';
		var step = g.ymax - g.ymin > 30 ? 4 : 2;
		for (var b = Math.ceil(g.ymin / step) * step; b <= g.ymax; b += step) svg += '<line class="kb-gl" x1="' + g.L + '" y1="' + Y(b) + '" x2="' + (g.W - g.R) + '" y2="' + Y(b) + '"/><text class="kb-ct" x="' + (g.L - 5) + '" y="' + (Y(b) + 4) + '" text-anchor="end">' + b + '</text>';
		svg += '<text class="kb-ct kb-axt" transform="translate(11 ' + ((g.T + g.H - g.B) / 2) + ') rotate(-90)" text-anchor="middle">BMI</text><g clip-path="url(#kb-clip)">';
		for (i = 0; i < LINES.length; i++) { (function (p) { svg += '<path class="kb-l' + (p === 50 ? ' kb-l50' : p === 5 || p === 85 || p === 95 ? ' kb-lcut' : '') + '" d="' + curve(function (m) { return KB.bmiAt(s, m, p); }) + '"/>'; })(LINES[i]); }
		svg += '<path class="kb-l kb-l120" d="' + curve(f120) + '"/></g>';
		var lastY = -99;
		LINES.concat([120]).forEach(function (p) {
			var b = p === 120 ? f120(240) : KB.bmiAt(s, 240, p); if (b < g.ymin || b > g.ymax) return; var y = Y(b);
			if (Math.abs(y - lastY) < 10 && p !== 95 && p !== 120 && p !== 85 && p !== 5) return; lastY = y;
			svg += '<text class="kb-pl" x="' + (g.W - g.R + 3) + '" y="' + (y + 4) + '">' + (p === 120 ? '120%' : p) + '</text>';
		});
		var pt = exp || (cur ? { months: cur.months, bmi: cur.A.bmi } : null);
		if (exp && cur) svg += '<circle class="kb-ghost" cx="' + X(cur.months) + '" cy="' + Y(clampY(cur.A.bmi)) + '" r="5"/>';
		if (pt) {
			var px = X(pt.months), py = Y(clampY(pt.bmi));
			svg += '<line class="kb-you-l" x1="' + px + '" y1="' + py + '" x2="' + px + '" y2="' + (g.H - g.B) + '"/><line class="kb-you-l" x1="' + g.L + '" y1="' + py + '" x2="' + px + '" y2="' + py + '"/><circle class="kb-you" cx="' + px + '" cy="' + py + '" r="' + (exp ? 9 : 7) + '"/>';
		}
		svg += '</svg>';
		var bar = '';
		if (cur) {
			bar = '<div class="kb-chartbar"><button type="button" class="tu-chip kb-try" aria-pressed="' + !!exp + '">&#9995; Try other numbers on the chart</button>';
			if (exp) {
				var P = KB.percentile(s, exp.months, exp.bmi), C = KB.category(s, exp.months, exp.bmi), moved = Math.abs(exp.months - cur.months) > 0.6 || Math.abs(exp.bmi - cur.A.bmi) > 0.05;
				bar += '<span class="kb-chartread" aria-live="polite"><b>Age ' + esc(KB.ageText(exp.months)) + '</b> &middot; <b>BMI ' + exp.bmi.toFixed(1) + '</b> &middot; ' + esc(KB.pctText(P)) + ' percentile, ' + NAMES[C] + '</span>';
				if (moved) bar += '<button type="button" class="tu-chip kb-use">Use these numbers</button><button type="button" class="tu-chip kb-back">&#8634; Back to my numbers</button>';
				else bar += '<span class="kb-charthint">Drag the dot or tap anywhere on the chart. The same BMI moves to a different percentile as a child gets older.</span>';
			}
			bar += '</div>';
		}
		$('kb-chart').innerHTML = bar + svg; $('kb-chart')._g = g;
	}
	(function () {
		var box = $('kb-chart'), drag = false;
		function at(e) {
			var svg = box.querySelector('svg'), g = box._g; if (!svg || !g || !exp) return;
			var rc = svg.getBoundingClientRect(), sx = (e.clientX - rc.left) / rc.width * g.W, sy = (e.clientY - rc.top) / rc.height * g.H;
			var mo = 24 + (sx - g.L) / (g.W - g.L - g.R) * 216, b = g.ymin + (1 - (sy - g.T) / (g.H - g.T - g.B)) * (g.ymax - g.ymin);
			mo = Math.max(24, Math.min(239.5, mo)); exp.months = Math.floor(mo) + 0.5; exp.bmi = Math.round(Math.max(g.ymin, Math.min(g.ymax, b)) * 10) / 10; drawChart();
		}
		box.addEventListener('click', function (e) {
			if (e.target.closest('.kb-try')) { exp = exp ? null : { months: cur.months, bmi: cur.A.bmi, R: [chartGeom().ymin, chartGeom().ymax] }; drawChart(); return; }
			if (e.target.closest('.kb-back')) { exp.months = cur.months; exp.bmi = cur.A.bmi; drawChart(); return; }
			if (e.target.closest('.kb-use')) {
				var k = exp, y = Math.floor(k.months / 12), m = Math.floor(k.months - y * 12);
				S.mode = 'age'; seg('kb-mode', 'age'); showMode(); $('kb-y').value = y; $('kb-m').value = m;
				$('kb-kg').value = r(k.bmi * cur.cm / 100 * cur.cm / 100, 1); fillFromKg(); exp = null; update(); exp = { months: cur.months, bmi: cur.A.bmi, R: k.R }; drawChart(); toast('Age and weight updated (same height)'); return;
			}
		});
		box.addEventListener('pointerdown', function (e) { if (!exp || !e.target.closest('svg')) return; drag = true; try { box.setPointerCapture(e.pointerId); } catch (x) {} at(e); e.preventDefault(); });
		box.addEventListener('pointermove', function (e) { if (drag) at(e); });
		function end() { drag = false; } box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
		if (window.ResizeObserver) { var w0 = 0; new ResizeObserver(function () { var w = box.clientWidth; if ((w < 520) !== (w0 < 520)) { w0 = w; drawChart(); } w0 = w; }).observe(box); }
	})();
	// ---------- start ----------
	seg('kb-sex', S.sex); seg('kb-mode', S.mode); showMode();
	$('kb-y').value = S.y; $('kb-m').value = S.m || '0'; $('kb-birth').value = S.birth; $('kb-on').value = S.on || todayIso();
	$('kb-kg').value = S.kg; fillFromKg(); $('kb-cm').value = S.cm; fillFromCm();
	update();
})();
