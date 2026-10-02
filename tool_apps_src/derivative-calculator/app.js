/* MES Derivative Calculator (UI). Maths: /main_js/cas/engine.py (SymPy in Pyodide, op "diff") via cas-client.js; shared UI: cas-ui.js. */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var U = window.CASUI, esc = U.esc, m = U.m;
	var ORD = ['', 'first', 'second', 'third', 'fourth', 'fifth'];

	function opLabel() {
		var v = $('cs-var').value.trim() || 'x', n = +$('cs-order').value;
		$('cs-opname').textContent = v.indexOf(',') >= 0 ? '∂/∂' + v.split(/[,\s]+/).filter(Boolean).join('∂') : (n > 1 ? 'd' + sup(n) + '/d' + v + sup(n) : 'd/d' + v);
	}
	function sup(n) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'[n] || ''; }
	['cs-var', 'cs-order'].forEach(function (id) { $(id).addEventListener('input', opLabel); $(id).addEventListener('change', opLabel); });

	function render(r) {
		var h = '<div class="cs-result"><div class="cs-result__label">' + (r.implicit ? 'Implicit derivative' : 'Derivative') + '</div>';
		h += m(r.op + '\\left[' + r.input + '\\right] = ' + r.result);
		if (r.unsimplified) h += '<div class="tu-note">Before simplifying:</div>' + m(r.unsimplified);
		if (r.alt && r.alt.length) h += '<div class="tu-note">Other forms:</div>' + r.alt.map(m).join('');
		var ok = r.sections.every(function (s) { return s.verified; });
		h += '<span class="cs-badge' + (ok ? '' : ' cs-badge--warn') + '">' + (ok ? '✓ Checked against SymPy' : 'Answer taken from SymPy') + '</span>';
		h += U.buttons(r, r.result) + '</div>';
		if (r.at) {
			h += '<div class="cs-kv"><div><div class="cs-sec__label">Value at ' + U.mi(r.at.point) + '</div>' + m(r.at.exact) +
				(r.at.decimal && r.at.decimal !== r.at.exact ? '<div class="tu-note">≈ ' + esc(r.at.decimal) + '</div>' : '') + '</div>';
			if (r.tangent) h += '<div><div class="cs-sec__label">Tangent line there</div>' + m(r.tangent.tex) + '</div>';
			h += '</div>';
		}
		h += '<details class="cs-steps-card tu-card" open><summary>Step-by-step solution</summary>';
		r.sections.forEach(function (s) {
			if (r.sections.length > 1) h += '<h3>' + esc(s.title) + '</h3>';
			h += U.steps(s.steps);
			if (r.sections.length > 1) h += m('= ' + s.result);
		});
		h += '</details>';
		if (r.plot) {
			var ord = +($('cs-order').value || 1);
			var leg = '<span><i></i>f(' + esc(r.plot.var) + ')</span><span><i class="cs-l2"></i>' + (ord === 1 ? 'f′' : 'f' + '⁽' + '⁰¹²³⁴⁵'[ord] + '⁾') + '(' + esc(r.plot.var) + ')</span>';
			if (r.graph) leg += '<a href="' + esc(U.graphLink(r.graph)) + '">Plot in the 2D graphing calculator</a>';
			h += U.plotHtml(r.plot, leg);
		}
		return h;
	}

	U.page({
		input: $('cs-in'), preview: $('cs-preview'), out: $('cs-out'), status: $('cs-status'), go: $('cs-go'),
		chips: $('cs-chips'), examples: $('cs-ex'), key: 'mes-derivative:v1',
		histList: $('cs-hist'), histCard: $('cs-hist-card'), histClear: $('cs-hist-clear'),
		hint: 'Type a function: x^2 sin x, e^(3x), sqrt x, ln(cos x)…', emptyMsg: 'Type a function to differentiate first.',
		params: function () { return { var: $('cs-var').value.trim(), order: $('cs-order').value === '1' ? '' : $('cs-order').value, at: $('cs-at').value.trim() }; },
		setParams: function (p, reset) {
			if (reset || p.var != null) $('cs-var').value = p.var || '';
			if (reset || p.order != null) $('cs-order').value = /^[1-5]$/.test(p.order || '') ? p.order : '1';
			if (reset || p.at != null) $('cs-at').value = p.at || '';
			opLabel();
		},
		request: function (text, p) { return { op: 'diff', expr: text, var: p.var, order: +(p.order || 1), at: p.at }; },
		render: render,
		label: function (r) { return r.plain ? '= ' + r.plain : ''; }
	});
	opLabel();
})();
