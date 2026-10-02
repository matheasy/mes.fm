/* MES Integral Calculator (UI). Maths: /main_js/cas/engine.py (SymPy in Pyodide, op "integrate") via cas-client.js; shared UI: cas-ui.js. */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var U = window.CASUI, esc = U.esc, m = U.m;
	var definite = false;

	function setKind(d) {
		definite = !!d;
		Array.prototype.forEach.call($('cs-kind').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', String((b.dataset.def === '1') === definite)); });
		Array.prototype.forEach.call(document.querySelectorAll('[data-def-only]'), function (el) { el.hidden = !definite; });
		$('cs-go').textContent = definite ? 'Evaluate integral' : 'Integrate';
		label();
	}
	function label() {
		var v = $('cs-var').value.trim() || 'x';
		$('cs-dx').textContent = 'd' + v;
		$('cs-opname').textContent = definite ? '∫' + ($('cs-lo').value.trim() ? '' : '') : '∫';
	}
	$('cs-kind').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setKind(b.dataset.def === '1'); });
	['cs-var', 'cs-lo', 'cs-hi'].forEach(function (id) { $(id).addEventListener('input', label); });

	function result(r) {
		var h = '<div class="cs-result"><div class="cs-result__label">' + (r.definite ? 'Definite integral' : 'Antiderivative') + '</div>';
		h += m(r.op + ' = ' + r.result);
		if (r.definite && r.decimal && !r.numeric_only && r.decimal !== r.plain) h += '<div class="tu-note">≈ ' + esc(r.decimal) + '</div>';
		if (r.definite && !r.numeric_only && r.antiderivative && !r.no_closed_form) h += '<div class="tu-note">Antiderivative used: ' + U.mi('F(' + r.var_tex + ') = ' + r.antiderivative) + '</div>';
		if (r.verify) h += '<span class="cs-badge' + (r.verify.ok ? '' : ' cs-badge--warn') + '">' + (r.verify.ok ? '✓ Verified by differentiating' : 'Could not verify symbolically') + '</span>';
		if (r.method === 'general') h += '<span class="cs-badge cs-badge--info">SymPy general algorithm</span>';
		if (r.numeric_only) h += '<span class="cs-badge cs-badge--info">Numeric (mpmath.quad)</span>';
		h += U.buttons(r, r.result) + '</div>';
		if (r.note) h += '<p class="tu-note">' + esc(r.note) + '</p>';
		if (r.warning) h += '<div class="cs-error">' + esc(r.warning) + '</div>';
		return h;
	}
	function render(r) {
		var h = result(r);
		if (r.steps && r.steps.length) h += '<details class="cs-steps-card tu-card" open><summary>Step-by-step solution</summary>' + U.steps(r.steps) + '</details>';
		else if (!r.numeric_only) h += '<div class="tu-card cs-steps-card"><p class="tu-note" style="margin:0;">No step-by-step solution is available for this integral: the result was computed by SymPy\'s general algorithm' +
			(r.no_closed_form ? ', which found no closed form.' : '.') + '</p></div>';
		if (r.verify && !r.definite) h += '<div class="tu-card cs-steps-card"><div class="cs-sec__label">Check</div>' + m(r.verify.tex) + '</div>';
		if (r.plot) {
			var leg = '<span><i></i>f(' + esc(r.plot.var) + ')</span>';
			if (r.plot.series.length > 1) leg += '<span><i class="cs-l2"></i>F(' + esc(r.plot.var) + '), C = 0</span>';
			if (r.plot.shade) leg += '<span><i class="cs-l4"></i>area (signed)</span>';
			if (r.graph) leg += '<a href="' + esc(U.graphLink(r.graph)) + '">Plot in the 2D graphing calculator</a>';
			h += U.plotHtml(r.plot, leg);
		}
		return h;
	}

	U.page({
		input: $('cs-in'), preview: $('cs-preview'), out: $('cs-out'), status: $('cs-status'), go: $('cs-go'),
		chips: $('cs-chips'), examples: $('cs-ex'), key: 'mes-integral:v1',
		histList: $('cs-hist'), histCard: $('cs-hist-card'), histClear: $('cs-hist-clear'),
		hint: 'Type a function: x e^x, 1/(x^2-1), sin^2 x cos x…', emptyMsg: 'Type a function to integrate first.',
		params: function () { return definite ? { var: $('cs-var').value.trim(), def: '1', lo: $('cs-lo').value.trim(), hi: $('cs-hi').value.trim() } : { var: $('cs-var').value.trim() }; },
		setParams: function (p, reset) {
			if (reset || p.var != null) $('cs-var').value = p.var || '';
			if (p.lo != null) $('cs-lo').value = p.lo;
			if (p.hi != null) $('cs-hi').value = p.hi;
			if (reset || p.def != null) setKind(p.def === '1');
			label();
		},
		request: function (text, p) { return { op: 'integrate', expr: text, var: p.var, definite: p.def === '1', lower: p.lo, upper: p.hi }; },
		previewPrefix: function () { return ''; },
		render: render,
		renderPartial: function (part) { return part.numeric ? '<div class="cs-result"><div class="cs-result__label">Numeric value (exact form still being worked out)</div>' + m('\\approx ' + part.numeric) + '<div class="cs-pending"><span class="cs-spin"></span>Looking for an exact value…</div></div>' : ''; },
		label: function (r) { return r.plain ? '= ' + r.plain : ''; }
	});
	setKind(definite);
})();
