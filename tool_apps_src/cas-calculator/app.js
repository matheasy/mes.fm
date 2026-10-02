/* MES CAS Calculator (UI). Maths: /main_js/cas/engine.py (SymPy in Pyodide, ops "solve" / "cas") via cas-client.js; shared UI: cas-ui.js. */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var U = window.CASUI, esc = U.esc, m = U.m;
	var mode = 'solve';
	var EX = {
		solve: [['0 = 2 - sin α · ln((1+sin α)/(1−sin α))', 'Launch-angle equation (Problems Plus 5)'], ['x^2 - 5x + 6 = 0', 'x² − 5x + 6 = 0'], ['sin(x) = 1/2', 'sin x = 1/2 (general solution)'],
			['e^x = 3x', 'eˣ = 3x'], ['x^3 - 2x - 5 = 0', 'x³ − 2x − 5 = 0'], ['x^2 + y^2 = 25, x - y = 1', 'circle and line (system)'], ['2x + y = 5; x - y = 1', 'linear system'],
			['abs(x - 2) < 3', '|x − 2| < 3'], ['x^2 - 4 >= 0', 'x² − 4 ≥ 0'], ['cos x = x', 'cos x = x'], ['(x+1)/(x-2) = 3', '(x + 1)/(x − 2) = 3'], ['a x^2 + b x + c = 0', 'ax² + bx + c = 0 for x', { var: 'x' }]],
		simplify: [['(x^2 - 1)/(x - 1)', 'simplify (x² − 1)/(x − 1)'], ['x^3 - x', 'factor x³ − x', { op: 'factor' }], ['(x + 1)^3', 'expand (x + 1)³', { op: 'expand' }],
			['1/(x^2 - 1)', 'partial fractions', { op: 'apart' }], ['1/x + 1/y', 'combine fractions', { op: 'together' }], ['sin(x)^2 + cos(x)^2', 'sin² x + cos² x', { op: 'trigsimp' }], ['1/(1 + sqrt 2)', 'rationalize', { op: 'rationalize' }]],
		limit: [['sin(x)/x', 'sin x / x as x → 0', { at: '0' }], ['(1 + 1/n)^n', '(1 + 1/n)ⁿ as n → ∞', { at: 'oo' }], ['1/x', '1/x as x → 0 (one-sided)', { at: '0', dir: '-' }], ['(x^2 - 9)/(x - 3)', '(x² − 9)/(x − 3) as x → 3', { at: '3' }]],
		series: [['e^x', 'eˣ (Maclaurin)'], ['cos x', 'cos x about π', { at: 'pi', n: '6' }], ['ln(1 + x)', 'ln(1 + x)'], ['1/(1 - x)', '1/(1 − x)']],
		sum: [['1/k^2', 'Σ 1/k² (Basel problem)'], ['k', 'Σ k from 1 to n', { from: '1', to: 'n' }], ['k^2', 'Σ k² from 1 to n', { from: '1', to: 'n' }], ['1/2^k', 'Σ 1/2ᵏ', { from: '0' }], ['k', '5! as a product', { kind: 'product', from: '1', to: '5' }]],
		matrix: [['[[1, 2], [3, 4]]', '2×2 matrix'], ['2 1; 1 2', 'symmetric 2×2 (rows with ;)'], ['[[2, 0, 0], [0, 3, 4], [0, 4, 9]]', '3×3 matrix']],
		evaluate: [['sqrt(2) * pi', '√2 · π', { digits: '30' }], ['e^(pi sqrt(163))', 'Ramanujan\'s constant', { digits: '40' }], ['sin(30°)', 'sin 30°'], ['(1 + sqrt 5)/2', 'golden ratio']]
	};
	var LABEL = { solve: 'Equation, inequality or system', simplify: 'Expression', limit: 'Function', series: 'Function', sum: 'Term (in k or n)', matrix: 'Matrix: [[1, 2], [3, 4]] or rows separated by ;', evaluate: 'Expression', calculus: 'Function' };
	var GO = { solve: 'Solve', simplify: 'Simplify', limit: 'Find the limit', series: 'Expand in a series', sum: 'Evaluate', matrix: 'Analyse matrix', evaluate: 'Evaluate' };
	var PH = { solve: 'e.g. x^2 - 5x + 6 = 0', simplify: 'e.g. (x^2 - 1)/(x - 1)', limit: 'e.g. sin(x)/x', series: 'e.g. e^x', sum: 'e.g. 1/k^2', matrix: 'e.g. [[1, 2], [3, 4]]', evaluate: 'e.g. sqrt(2)*pi', calculus: 'e.g. x^2 sin x' };

	function setMode(md, keepInput) {
		mode = EX[md] || md === 'calculus' ? md : 'solve';
		Array.prototype.forEach.call($('cs-tabs').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String(b.dataset.mode === mode)); });
		Array.prototype.forEach.call(document.querySelectorAll('.cs-mode'), function (el) { el.hidden = el.getAttribute('data-modes').split(' ').indexOf(mode) < 0; });
		$('cs-inlabel').textContent = LABEL[mode];
		$('cs-in').placeholder = PH[mode];
		$('cs-go').textContent = GO[mode] || 'Go';
		$('cs-varlabel').textContent = mode === 'solve' ? 'Variable(s)' : mode === 'sum' ? 'Index' : 'Variable';
		$('cs-atlabel').textContent = mode === 'series' ? 'About the point' : 'Approaches';
		$('cs-tip').textContent = mode === 'solve' ? 'Press Enter to run (Shift+Enter for a new line). Separate the equations of a system with commas, semicolons or new lines.' : 'Press Enter to run.';
		var sel = $('cs-ex');
		sel.innerHTML = '<option value="">Choose an example…</option>' + (EX[mode] || []).map(function (e) {
			return '<option value="' + esc(e[0]) + '" data-p="' + esc(JSON.stringify(Object.assign({ m: mode }, e[2] || {}))) + '">' + esc(e[1]) + '</option>';
		}).join('');
		if (!keepInput && mode !== 'calculus') { $('cs-out').hidden = true; }
		calcLinks();
		autoGrow();
	}
	$('cs-tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) { setMode(b.dataset.mode, true); $('cs-in').dispatchEvent(new Event('input')); } });
	function calcLinks() {
		var q = $('cs-in').value.trim();
		$('cs-to-d').href = '/derivative-calculator' + (q ? '?q=' + encodeURIComponent(q) : '');
		$('cs-to-i').href = '/integral-calculator' + (q ? '?q=' + encodeURIComponent(q) : '');
	}
	function autoGrow() { var t = $('cs-in'); t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight + 2, 220) + 'px'; }
	$('cs-in').addEventListener('input', function () { calcLinks(); autoGrow(); });

	/* ---------- renderers ---------- */
	function badge(text, kind) { return '<span class="cs-badge' + (kind ? ' cs-badge--' + kind : '') + '">' + esc(text) + '</span>'; }
	function solList(list, trig) {
		return '<ul class="cs-sols">' + list.map(function (d) {
			var exactNum = /^\\approx/.test(d.tex);
			return '<li>' + U.ml((d.lhs || '') + d.tex) +
				(d.decimal && !exactNum ? '<span class="cs-dec">≈ ' + esc(d.decimal) + '</span>' : '') +
				(trig && d.degrees ? '<span class="cs-deg">' + (exactNum || d.decimal ? '' : '') + '≈ ' + esc(d.degrees) + '°</span>' : '') + '</li>';
		}).join('') + '</ul>';
	}
	function renderSolve(r, partial) {
		var h = '<div class="cs-result">';
		if (r.kind === 'check') return h + '<p>' + esc(r.summary) + '</p></div>';
		if (r.kind === 'inequality') {
			h += '<div class="cs-result__label">Solution set</div>' + m(r.inequality) + m(r.var_tex + ' \\in ' + r.set) + U.buttons(r, r.set) + '</div>';
		} else if (r.kind === 'system') {
			h += '<div class="cs-result__label">System</div>' + m(r.system);
			h += '<div class="cs-result__label" style="margin-top:0.6em;">' + (r.solutions.length === 1 ? 'Solution' : r.solutions.length ? r.solutions.length + ' solutions' : 'Solutions') + '</div>';
			if (r.solutions.length) h += '<ul class="cs-sols">' + r.solutions.map(function (d) { return '<li>' + U.ml(d.tex) + (d.decimal ? '<span class="cs-dec">' + esc(d.decimal) + '</span>' : '') + '</li>'; }).join('') + '</ul>';
			if (r.complex && r.complex.length) h += '<div class="tu-note" style="margin-top:0.5em;">Complex solutions:</div><ul class="cs-sols">' + r.complex.map(function (d) { return '<li>' + U.ml(d.tex) + '</li>'; }).join('') + '</ul>';
			if (r.summary) h += '<p class="tu-note">' + esc(r.summary) + '</p>';
			h += U.buttons({ plain: r.solutions.map(function (d) { return d.plain; }).join('; ') }, r.solutions.map(function (d) { return d.tex; }).join(' \\\\ ')) + '</div>';
		} else {
			h += '<div class="cs-result__label">Equation</div>' + m(r.equation);
			var n = r.solutions.length;
			h += '<div class="cs-result__label" style="margin-top:0.6em;">' + (n ? (n === 1 ? 'Real solution' : n + ' real solutions') + (r.interval ? ' in ' + U.mi('[' + r.interval[0] + ', ' + r.interval[1] + ']') : '') : 'Solutions') + '</div>';
			r.solutions.forEach(function (d) { d.lhs = r.var_tex + ' = '; if (/^\\approx/.test(d.tex)) d.lhs = r.var_tex + ' '; });
			if (n) h += solList(r.solutions, r.trig);
			if (r.trig && n && r.solutions.some(function (d) { return d.degrees; })) h += '<div class="tu-note">Angles in radians, with degrees alongside.</div>';
			if (r.complex && r.complex.length) h += '<div class="tu-note" style="margin-top:0.5em;">Complex solutions:</div>' + solList(r.complex.map(function (d) { d.lhs = r.var_tex + ' = '; return d; }), false);
			if (r.general) h += '<div class="cs-result__label" style="margin-top:0.6em;">All solutions' + (r.general_exact ? '' : ' (the function repeats every ' + U.mi(r.period) + ')') + '</div>' + U.ml(r.general);
			if (r.summary) h += '<p class="tu-note">' + esc(r.summary) + '</p>';
			if (r.method === 'numeric' && n && !partial) h += badge('Numeric: no closed form found', 'info');
			if (r.method === 'mixed') h += badge('Some roots exact, some numeric', 'info');
			if (r.verified && n && r.method !== 'numeric') h += badge('✓ Checked by substituting back');
			if (r.method === 'numeric' && n) h += badge('✓ Each root refined to 30 digits');
			if (partial) h += '<div class="cs-pending"><span class="cs-spin"></span>Looking for exact forms…</div>';
			h += U.buttons({ plain: r.solutions.map(function (d) { return r.var + ' = ' + d.plain; }).join(', ') }, r.solutions.map(function (d) { return d.lhs + d.tex; }).join(',\\; ')) + '</div>';
		}
		if (r.steps && r.steps.length) h += '<details class="cs-steps-card tu-card" open><summary>Step-by-step solution</summary>' + U.steps(r.steps) + '</details>';
		if (r.plot) {
			var leg = '<span><i></i>' + esc(r.plot.flabel || 'f') + '</span>' + (r.plot.roots && r.plot.roots.length ? '<span><i class="cs-l3"></i>roots</span>' : '');
			if (r.var === 'x' && r.plot.flabel) leg += '<a href="' + esc(U.graphLink([r.plot.flabel.replace(/^f\(x\) = /, '').replace(/\*\*/g, '^')])) + '">Plot in the 2D graphing calculator</a>';
			h += U.plotHtml(r.plot, leg);
		}
		return h;
	}
	function renderOther(r) {
		var h = '<div class="cs-result">';
		if (r.mode === 'matrix') {
			h += '<div class="cs-result__label">Matrix</div>' + m('A = ' + r.input) + U.buttons(r, r.input) + '</div><div class="cs-kv">';
			r.items.forEach(function (it) { h += '<div><div class="cs-sec__label">' + esc(it.label) + '</div>' + m(it.tex) + '</div>'; });
			h += '</div>';
		} else {
			var lhs = r.op_text ? '' : (/^\\/.test(r.op) ? r.op : '');
			if (r.op_text) h += '<div class="cs-result__label">' + esc(r.op) + '</div>' + m(r.result);
			else if (lhs) h += '<div class="cs-result__label">Result</div>' + m(lhs + ' = ' + r.result);
			else h += '<div class="cs-result__label">' + esc(r.op) + '</div>' + m(r.input + ' = ' + r.result);
			if (r.polynomial) h += '<div class="tu-note">As a polynomial (without the O-term):</div>' + m(r.polynomial);
			if (r.decimal && r.decimal !== r.plain) h += '<div class="tu-note">≈ ' + esc(r.decimal) + '</div>';
			if (r.same) h += badge('Already as simple as SymPy can make it', 'info');
			else if (r.verified) h += badge('✓ Equal to the input (checked)');
			h += U.buttons(r, r.result) + '</div>';
			if (r.note) h += '<p class="tu-note">' + esc(r.note) + '</p>';
		}
		if (r.steps && r.steps.length) h += '<details class="cs-steps-card tu-card" open><summary>Steps</summary>' + U.steps(r.steps) + '</details>';
		return h;
	}

	setMode('solve', true);
	U.page({
		input: $('cs-in'), preview: $('cs-preview'), out: $('cs-out'), status: $('cs-status'), go: $('cs-go'),
		chips: $('cs-chips'), examples: $('cs-ex'), key: 'mes-cas:v1',
		histList: $('cs-hist'), histCard: $('cs-hist-card'), histClear: $('cs-hist-clear'),
		hint: 'Your input will be shown here as maths.', emptyMsg: 'Type an equation or expression first.',
		previewMode: function () { return mode === 'solve' ? 'solve' : mode === 'matrix' ? 'matrix' : ''; },
		params: function () {
			var p = { m: mode === 'solve' ? '' : mode };
			if (mode === 'solve') { p.var = $('cs-var').value.trim(); p.lo = $('cs-lo').value.trim(); p.hi = $('cs-hi').value.trim(); }
			else if (mode === 'simplify') { p.var = $('cs-var').value.trim(); p.op = $('cs-op').value === 'simplify' ? '' : $('cs-op').value; }
			else if (mode === 'limit') { p.var = $('cs-var').value.trim(); p.at = $('cs-at').value.trim(); p.dir = $('cs-dir').value === '+-' ? '' : $('cs-dir').value; }
			else if (mode === 'series') { p.var = $('cs-var').value.trim(); p.at = $('cs-at').value.trim(); p.n = $('cs-n').value; }
			else if (mode === 'sum') { p.var = $('cs-var').value.trim(); p.kind = $('cs-kind').value === 'sum' ? '' : 'product'; p.from = $('cs-from').value.trim(); p.to = $('cs-to').value.trim(); }
			else if (mode === 'evaluate') { p.digits = $('cs-digits').value; }
			return p;
		},
		setParams: function (p, reset) {
			if (p.m != null || reset) setMode(p.m || 'solve', true);
			if (reset) { $('cs-var').value = ''; $('cs-lo').value = ''; $('cs-hi').value = ''; $('cs-op').value = 'simplify'; $('cs-at').value = '0'; $('cs-dir').value = '+-'; $('cs-n').value = '6';
				$('cs-kind').value = 'sum'; $('cs-from').value = '1'; $('cs-to').value = 'oo'; $('cs-digits').value = '15'; }
			if (p.var != null) $('cs-var').value = p.var;
			if (p.lo != null) $('cs-lo').value = p.lo;
			if (p.hi != null) $('cs-hi').value = p.hi;
			if (p.op) $('cs-op').value = p.op;
			if (p.at != null) $('cs-at').value = p.at;
			if (p.dir) $('cs-dir').value = p.dir;
			if (p.n) $('cs-n').value = p.n;
			if (p.kind) $('cs-kind').value = p.kind;
			if (p.from != null) $('cs-from').value = p.from;
			if (p.to != null) $('cs-to').value = p.to;
			if (p.digits) $('cs-digits').value = p.digits;
			autoGrow();
		},
		request: function (text, p) {
			if (mode === 'calculus') return null;
			if (mode === 'solve') return { op: 'solve', expr: text, var: p.var, lo: p.lo, hi: p.hi };
			var r = { op: 'cas', mode: mode, expr: text, var: p.var };
			if (mode === 'simplify') r.mode = p.op || 'simplify';
			if (mode === 'limit') { r.at = p.at || '0'; r.dir = p.dir || '+-'; }
			if (mode === 'series') { r.at = p.at || '0'; r.order = +(p.n || 6); }
			if (mode === 'sum') { r.mode = p.kind || 'sum'; r.lo = p.from || '1'; r.hi = p.to || 'oo'; }
			if (mode === 'evaluate') r.digits = +(p.digits || 15);
			return r;
		},
		render: function (r) { return r.kind ? renderSolve(r, false) : renderOther(r); },
		renderPartial: function (part) { return part.partial ? renderSolve(part.partial, true) : ''; },
		label: function (r) {
			if (r.kind === 'equation') return r.solutions.map(function (d) { return d.plain; }).join(', ') || (r.summary || '');
			if (r.kind === 'system') return r.solutions.map(function (d) { return d.plain; }).join('; ');
			if (r.kind === 'inequality') return r.plain;
			return r.plain ? r.plain.slice(0, 60) : '';
		}
	});
})();
