/* MES 3D Graphing Calculator UI (compiler + meshing are in lib.js, prepended above as G3).
 * three.js (core only, pinned) is imported lazily from jsDelivr (unpkg as a fallback) once the page is interactive; the rows,
 * sliders and messages work without it. Camera controls are our own (orbit / pan / zoom / pinch), so no add-on modules are needed. */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-graph3d:v1';
	var THREE_URLS = ['https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js', 'https://unpkg.com/three@0.170.0/build/three.module.min.js'];
	var PALETTE = ['#c74440', '#2d70b3', '#388c46', '#6042a6', '#fa7e19', '#1b1b1b', '#e0409a', '#00968a'];
	var DEF_DOM = { x: [-5, 5], y: [-5, 5], z: [-5, 5] };
	// [name, rows (text or [text, style]), optional box [x0,x1,y0,y1,z0,z1]]
	var EXAMPLES = [
		['Paraboloid', [['z = (x^2 + y^2)/4 - 3', 'h']]],
		['Saddle', ['z = (x^2 - y^2)/5']],
		['Ripple (sinc)', [['z = 4 sin(2sqrt(x^2 + y^2))/(2sqrt(x^2 + y^2))', 'h']]],
		['Wave with sliders', ['a = 1', 'b = 0', 'z = 2sin(a x + b) cos(a y)']],
		['Sphere (equation)', ['x^2 + y^2 + z^2 = 9']],
		['Sphere (parametric)', ['(3cos(u)sin(v), 3sin(u)sin(v), 3cos(v)) {0<=u<=2π, 0<=v<=π}']],
		['Torus', ['(sqrt(x^2 + y^2) - 3)^2 + z^2 = 1']],
		['Torus (parametric)', ['((3 + cos(v))cos(u), (3 + cos(v))sin(u), sin(v))']],
		['Helix', ['(3cos(t), 3sin(t), t/3) {-4π<=t<=4π}']],
		['Möbius strip', ['((3 + v cos(u/2))cos(u), (3 + v cos(u/2))sin(u), v sin(u/2)) {0<=u<=2π, -1<=v<=1}']],
		['Cone', ['z^2 = x^2 + y^2']],
		['Hyperboloid', ['x^2 + y^2 - z^2 = 2']],
		['Helicoid', ['(v cos(u), v sin(u), u/2) {-2π<=u<=2π, -4<=v<=4}']],
		['Plane and a point', ['z = 2 - x/2 - y/3', '(2, 3, 0)']],
		['Tangent (breaks at asymptotes)', ['z = tan(x)']],
		['Heart', [['(2.25x^2 + y^2 + z^2 - 1)^3 = y^2 z^3 + 0.1125x^2 z^3', 's']], [-1.5, 1.5, -1.5, 1.5, -1.5, 1.5]],
		['Your own function', ['f(x, y) = sin(x) cos(y)', 'z = f(x/2, y/2) - 3']]
	];
	var DEFAULT_ROWS = ['a = 1', 'z = a sin(x) cos(y)'];

	var rows = [], nextId = 1, activeId = null, deg = false, dom = cloneDom(DEF_DOM);
	var opts = { box: true, grid: true, spin: false };
	var cam = { theta: 30, phi: 24, dist: 0, tx: 0, ty: 0, tz: 0 };   // degrees; dist 0 = fit
	var P = {}, pmeta = {}, F = {}, M = G3.makeM(), env = { P: P, F: F, M: M, userFns: {} };
	var toastTimer;
	function cloneDom(d) { return { x: d.x.slice(), y: d.y.slice(), z: d.z.slice() }; }
	function toast(msg) { var t = $('g3-toast'); t.textContent = msg; t.classList.add('tu-toast--show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 1500); }
	function copy(text, msg) {
		function done() { toast(msg || 'Copied'); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
		function fallback() { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } document.body.removeChild(ta); }
	}
	function isDark() { return document.body.classList.contains('dark-mode'); }
	function fmt4(v) { return Math.abs(v) < 1e-9 ? '0' : parseFloat(v.toPrecision(4)).toString(); }

	/* ---------- state: rows, URL, localStorage ---------- */
	function pickColor() { var used = rows.map(function (r) { return r.color; }); for (var i = 0; i < PALETTE.length; i++) if (used.indexOf(PALETTE[i]) < 0) return PALETTE[i]; return PALETTE[rows.length % PALETTE.length]; }
	function addRow(text, color, show, style, wire, op) {
		var r = { id: nextId++, text: text || '', color: color || pickColor(), show: show !== false, style: style === 'h' ? 'h' : 's', wire: wire === 0 || wire === 1 ? wire : -1, op: isFinite(op) && op > 0 ? Math.min(1, op) : 1, desc: null, err: '', open: false };
		rows.push(r); return r;
	}
	function snapshot() {
		var pm = {}; Object.keys(pmeta).forEach(function (k) { pm[k] = [P[k], pmeta[k].min, pmeta[k].max]; });
		return { r: rows.map(function (r) { return [r.text, r.color, r.show ? 1 : 0, r.style, r.wire, r.op]; }), d: deg ? 1 : 0, p: pm,
			b: [dom.x[0], dom.x[1], dom.y[0], dom.y[1], dom.z[0], dom.z[1]], c: [cam.theta, cam.phi, cam.dist, cam.tx, cam.ty, cam.tz].map(function (v) { return +(+v).toFixed(4); }),
			o: [opts.box ? 1 : 0, opts.grid ? 1 : 0] };
	}
	function setDomArr(b) { if (b && b.length === 6 && b.every(isFinite) && b[0] < b[1] && b[2] < b[3] && b[4] < b[5]) { dom = { x: [b[0], b[1]], y: [b[2], b[3]], z: [b[4], b[5]] }; return true; } return false; }
	function restore(s) {
		rows = []; (s.r || []).forEach(function (a) { if (typeof a === 'string') a = [a]; addRow(String(a[0] || '').slice(0, 500), /^#[0-9a-f]{6}$/i.test(a[1]) ? a[1] : null, a[2] !== 0, a[3], a[4], +a[5]); });
		deg = !!s.d; M.deg = deg;
		Object.keys(s.p || {}).forEach(function (k) { if (/^[A-Za-z]$/.test(k) && Array.isArray(s.p[k]) && s.p[k].every(isFinite)) { P[k] = s.p[k][0]; pmeta[k] = { min: s.p[k][1], max: s.p[k][2], play: false }; } });
		setDomArr(s.b);
		if (s.c && s.c.length === 6 && s.c.every(isFinite)) cam = { theta: s.c[0], phi: s.c[1], dist: s.c[2], tx: s.c[3], ty: s.c[4], tz: s.c[5] };
		if (s.o) { opts.box = s.o[0] !== 0; opts.grid = s.o[1] !== 0; }
	}
	function encode(s) { try { return btoa(unescape(encodeURIComponent(JSON.stringify(s)))); } catch (e) { return ''; } }
	function decode(t) { try { return JSON.parse(decodeURIComponent(escape(atob(t)))); } catch (e) { return null; } }
	var saveTimer;
	function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(snapshot())); } catch (e) {} }, 400); }

	/* ---------- compile every row ---------- */
	var paramOrder = [];
	function compileAll() {
		env.userFns = {};
		Object.keys(F).forEach(function (k) { delete F[k]; });
		rows.forEach(function (r) { var m = /^\s*([A-Za-z])\s*\(\s*[A-Za-z]\s*(,\s*[A-Za-z]\s*){0,2}\)\s*=/.exec(r.text); if (m && !/[xyzuvte]/.test(m[1])) { env.userFns[m[1]] = true; F[m[1]] = function () { return NaN; }; } });
		var defined = {}, used = [];
		rows.forEach(function (r) {
			r.err = ''; r.desc = null;
			try {
				r.desc = G3.analyze(r.text, env);
				if (r.desc.kind === 'param') { defined[r.desc.name] = r.id; if (isFinite(r.desc.value)) P[r.desc.name] = r.desc.value; }
				r.desc.params.forEach(function (n) { if (used.indexOf(n) < 0) used.push(n); });
			} catch (e) { r.err = e.message || 'Cannot read this'; r.desc = { kind: 'error', params: [] }; }
		});
		paramOrder = [];
		Object.keys(defined).forEach(function (n) { if (paramOrder.indexOf(n) < 0) paramOrder.push(n); });
		used.forEach(function (n) { if (paramOrder.indexOf(n) < 0) paramOrder.push(n); });
		paramOrder.forEach(function (n) {
			if (!isFinite(P[n])) P[n] = 1;
			if (!pmeta[n]) pmeta[n] = { min: -10, max: 10, play: false };
			var v = P[n]; if (v < pmeta[n].min) pmeta[n].min = Math.floor(v - 1); if (v > pmeta[n].max) pmeta[n].max = Math.ceil(v + 1);
		});
		paramOrder.forEach(function (n) { pmeta[n].row = defined[n] || 0; });
		Object.keys(pmeta).forEach(function (n) { if (paramOrder.indexOf(n) < 0) { pmeta[n].play = false; } });
	}
	function piStr(v) {   // 12.566 -> "4π", -1.5708 -> "-π/2"
		var k2 = Math.round(v / Math.PI * 2);
		if (!v || Math.abs(v / Math.PI * 2 - k2) > 1e-9) return G3.fmtn(v);
		var sg = k2 < 0 ? '-' : '', a = Math.abs(k2);
		return a % 2 === 0 ? sg + (a === 2 ? '' : a / 2) + 'π' : sg + (a === 1 ? '' : a) + 'π/2';
	}
	function rng(r) { return '[' + piStr(r.lo) + ', ' + piStr(r.hi) + ']'; }
	function describe(r) {
		if (r.err) return r.err;
		var d = r.desc; if (!d) return '';
		switch (d.kind) {
			case 'surface': return (d.def ? 'function ' + d.def + ', drawn as ' : '') + 'surface ' + d.axis + ' = f(' + (d.axis === 'z' ? 'x, y' : d.axis === 'x' ? 'y, z' : 'x, z') + ')';
			case 'def': return 'function ' + d.def;
			case 'implicit': return 'implicit surface';
			case 'curve': return 'curve, t ∈ ' + rng(d.t);
			case 'psurface': return 'parametric surface, u ∈ ' + rng(d.u) + ', v ∈ ' + rng(d.v);
			case 'point': return '(' + G3.fmtn(d.x) + ', ' + G3.fmtn(d.y) + ', ' + G3.fmtn(d.z) + ')';
			case 'param': return 'slider ' + d.name + ' = ' + G3.fmtn(d.value);
		}
		return '';
	}

	/* ---------- rows UI ---------- */
	var lastInput = null;
	function isSurf(r) { return r.desc && (r.desc.kind === 'surface' || r.desc.kind === 'psurface' || r.desc.kind === 'implicit'); }
	function wireOn(r) { return r.wire === -1 ? !(r.desc && r.desc.kind === 'implicit') : !!r.wire; }
	function autosize(t) { if (!t) return; t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }
	function autosizeAll() { Array.prototype.forEach.call(document.querySelectorAll('.g3-in'), autosize); }
	window.addEventListener('resize', autosizeAll);
	if (window.ResizeObserver) { var __rw = 0; new ResizeObserver(function (en) { var w = Math.round(en[0].contentRect.width); if (w !== __rw) { __rw = w; autosizeAll(); } }).observe(document.getElementById('g3-rows')); }
	function renderRows() {
		var box = $('g3-rows'); box.innerHTML = '';
		rows.forEach(function (r) {
			var el = document.createElement('div'); el.className = 'g3-row' + (r.id === activeId ? ' is-active' : ''); el.dataset.id = r.id;
			el.innerHTML = '<input type="color" class="g3-color" aria-label="Colour" value="' + r.color + '">' +
				'<div class="g3-rowmain"><textarea class="g3-in" rows="1" wrap="soft" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" placeholder="z = x^2 - y^2" aria-label="Expression"></textarea><div class="g3-msg"></div></div>' +
				'<button type="button" class="g3-ibtn g3-eye" aria-label="Show or hide" aria-pressed="' + r.show + '" title="Show / hide">◉</button>' +
				'<button type="button" class="g3-ibtn g3-gear" aria-label="Style options" aria-expanded="' + r.open + '" title="Colour, grid lines, opacity">⚙</button>' +
				'<button type="button" class="g3-ibtn g3-del" aria-label="Delete" title="Delete">✕</button>' +
				'<div class="g3-opts"' + (r.open ? '' : ' hidden') + '>' +
				'<label>Colour <select class="g3-style"><option value="s">Solid</option><option value="h">By height</option></select></label>' +
				'<label><input type="checkbox" class="g3-wire"> Grid lines</label>' +
				'<label>Opacity <input type="range" class="g3-op" min="0.1" max="1" step="0.05" aria-label="Opacity"></label></div>';
			el.querySelector('.g3-in').value = r.text;
			el.querySelector('.g3-style').value = r.style;
			el.querySelector('.g3-op').value = r.op;
			box.appendChild(el); autosize(el.querySelector('.g3-in')); updateMsg(r);
		});
	}
	function rowEl(r) { return $('g3-rows').querySelector('[data-id="' + r.id + '"]'); }
	function updateMsg(r) {
		var el = rowEl(r); if (!el) return; var m = el.querySelector('.g3-msg'); m.textContent = describe(r); m.className = 'g3-msg' + (r.err ? ' is-err' : '');
		el.querySelector('.g3-wire').checked = wireOn(r);
	}
	function rowById(id) { for (var i = 0; i < rows.length; i++) if (rows[i].id === +id) return rows[i]; return null; }
	function setActive(id) { activeId = id; Array.prototype.forEach.call($('g3-rows').children, function (el) { el.classList.toggle('is-active', +el.dataset.id === id); }); }
	var boxRows = $('g3-rows');
	boxRows.addEventListener('input', function (e) {
		var el = e.target.closest('.g3-row'); if (!el) return; var r = rowById(el.dataset.id), c = e.target.classList;
		if (c.contains('g3-in')) { if (/[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/[\r\n]+/g, ' '); autosize(e.target); r.text = e.target.value; changed(); }
		else if (c.contains('g3-color')) { r.color = e.target.value; restyle(r); saveSoon(); }
		else if (c.contains('g3-op')) { r.op = parseFloat(e.target.value); restyle(r); saveSoon(); }
	});
	boxRows.addEventListener('change', function (e) {
		var el = e.target.closest('.g3-row'); if (!el) return; var r = rowById(el.dataset.id), c = e.target.classList;
		if (c.contains('g3-style')) { r.style = e.target.value; restyle(r); saveSoon(); }
		else if (c.contains('g3-wire')) { r.wire = e.target.checked ? 1 : 0; restyle(r); saveSoon(); }
	});
	boxRows.addEventListener('focusin', function (e) { var el = e.target.closest('.g3-row'); if (!el) return; if (e.target.classList.contains('g3-in')) lastInput = e.target; setActive(+el.dataset.id); });
	boxRows.addEventListener('click', function (e) {
		var el = e.target.closest('.g3-row'); if (!el) return; var r = rowById(el.dataset.id), b;
		if ((b = e.target.closest('.g3-eye'))) { r.show = !r.show; b.setAttribute('aria-pressed', String(r.show)); restyle(r); saveSoon(); }
		else if ((b = e.target.closest('.g3-gear'))) { r.open = !r.open; b.setAttribute('aria-expanded', String(r.open)); el.querySelector('.g3-opts').hidden = !r.open; }
		else if (e.target.closest('.g3-del')) {
			rows = rows.filter(function (x) { return x !== r; }); if (!rows.length) addRow('');
			if (activeId === r.id) activeId = rows[rows.length - 1].id;
			renderRows(); changed();
		}
	});
	boxRows.addEventListener('keydown', function (e) {
		if (e.key === 'Enter' && e.target.classList.contains('g3-in')) {
			e.preventDefault(); var el = e.target.closest('.g3-row'), r = rowById(el.dataset.id), idx = rows.indexOf(r);
			var nr = addRow(''); rows.splice(rows.length - 1, 1); rows.splice(idx + 1, 0, nr); renderRows(); changed();
			rowEl(nr).querySelector('.g3-in').focus();
		}
	});
	function resetParams() { Object.keys(P).forEach(function (k) { delete P[k]; }); pmeta = {}; }
	$('g3-add').addEventListener('click', function () { var r = addRow(''); renderRows(); changed(); rowEl(r).querySelector('.g3-in').focus(); });
	$('g3-clear').addEventListener('click', function () { rows = []; resetParams(); var r = addRow(''); activeId = r.id; renderRows(); changed(); rowEl(r).querySelector('.g3-in').focus(); });
	var ex = $('g3-examples'); ex.innerHTML = '<option value="">Examples…</option>' + EXAMPLES.map(function (e, i) { return '<option value="' + i + '">' + e[0] + '</option>'; }).join('');
	ex.addEventListener('change', function () {
		if (ex.value === '') return; var e = EXAMPLES[+ex.value]; ex.value = '';
		loadExample(e);
	});
	function loadExample(e) {
		rows = []; resetParams();
		e[1].forEach(function (t) { if (Array.isArray(t)) addRow(t[0], null, true, t[1]); else addRow(t); });
		dom = cloneDom(DEF_DOM); if (e[2]) setDomArr(e[2]);
		deg = false; setDeg();   // the examples are written in radians (π ranges)
		activeId = rows[rows.length - 1].id; renderRows(); renderDom(); domChanged(); homeView(); changed();
	}
	$('g3-keys').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
	$('g3-keys').addEventListener('click', function (e) {
		var b = e.target.closest('button'); if (!b) return;
		var inp = lastInput && document.body.contains(lastInput) ? lastInput : $('g3-rows').querySelector('.g3-in'); if (!inp) return;
		var s = b.dataset.ins, caret = s.indexOf('§'); s = s.replace('§', '');
		var a = inp.selectionStart == null ? inp.value.length : inp.selectionStart, z = inp.selectionEnd == null ? a : inp.selectionEnd;
		inp.value = inp.value.slice(0, a) + s + inp.value.slice(z);
		var p = a + (caret >= 0 ? caret : s.length); inp.focus(); try { inp.setSelectionRange(p, p); } catch (e2) {}
		inp.dispatchEvent(new Event('input', { bubbles: true }));
	});

	/* ---------- sliders ---------- */
	var shownParams = '';
	function renderParams(force) {
		var sig = paramOrder.join(','); if (!force && sig === shownParams) { refreshParamValues(); return; }
		shownParams = sig; var box = $('g3-params');
		if (!paramOrder.length) { box.innerHTML = ''; return; }
		box.innerHTML = '<h3>Sliders</h3>' + paramOrder.map(function (n) {
			var m = pmeta[n];
			return '<div class="g3-param" data-n="' + n + '"><b>' + n + '</b><input type="range" min="' + m.min + '" max="' + m.max + '" step="any" value="' + P[n] + '" aria-label="Value of ' + n + '">' +
				'<input class="g3-num" type="text" inputmode="decimal" value="' + G3.fmtn(P[n]) + '" aria-label="' + n + ' value"><button type="button" class="g3-ibtn g3-play" aria-pressed="' + !!m.play + '" title="Animate" aria-label="Animate ' + n + '">' + (m.play ? '❚❚' : '▶') + '</button>' +
				'<div class="g3-lim"><span>min <input class="g3-min" type="text" inputmode="decimal" value="' + m.min + '"></span><span>max <input class="g3-max" type="text" inputmode="decimal" value="' + m.max + '"></span></div></div>';
		}).join('');
	}
	function refreshParamValues() {
		Array.prototype.forEach.call($('g3-params').querySelectorAll('.g3-param'), function (el) {
			var n = el.dataset.n; if (document.activeElement === el.querySelector('.g3-num')) return;
			el.querySelector('input[type=range]').value = P[n]; el.querySelector('.g3-num').value = G3.fmtn(P[n]);
		});
	}
	function setParam(n, v) {
		P[n] = v; var m = pmeta[n];
		if (m && m.row) { var r = rowById(m.row); if (r) { r.text = n + ' = ' + G3.fmtn(v); var inp = rowEl(r) && rowEl(r).querySelector('.g3-in'); if (inp && document.activeElement !== inp) { inp.value = r.text; autosize(inp); } r.desc.value = v; updateMsg(r); } }
		scheduleBuild(true); saveSoon();
	}
	$('g3-params').addEventListener('input', function (e) {
		var el = e.target.closest('.g3-param'); if (!el) return; var n = el.dataset.n, m = pmeta[n];
		if (e.target.type === 'range') { var v = parseFloat(e.target.value); el.querySelector('.g3-num').value = G3.fmtn(v); setParam(n, v); }
		else if (e.target.classList.contains('g3-num')) { var v2 = parseFloat(e.target.value); if (isFinite(v2)) { if (v2 < m.min) m.min = v2; if (v2 > m.max) m.max = v2; var rg = el.querySelector('input[type=range]'); rg.min = m.min; rg.max = m.max; rg.value = v2; setParam(n, v2); } }
		else if (e.target.classList.contains('g3-min') || e.target.classList.contains('g3-max')) {
			var lo = parseFloat(el.querySelector('.g3-min').value), hi = parseFloat(el.querySelector('.g3-max').value);
			if (isFinite(lo) && isFinite(hi) && lo < hi) { m.min = lo; m.max = hi; var rg2 = el.querySelector('input[type=range]'); rg2.min = lo; rg2.max = hi; saveSoon(); }
		}
	});
	$('g3-params').addEventListener('click', function (e) {
		var b = e.target.closest('.g3-play'); if (!b) return; var n = b.closest('.g3-param').dataset.n; pmeta[n].play = !pmeta[n].play; b.setAttribute('aria-pressed', String(pmeta[n].play)); b.textContent = pmeta[n].play ? '❚❚' : '▶'; if (pmeta[n].play) startAnim();
	});
	var animOn = false, lastT = 0, dir = {};
	function startAnim() { if (animOn) return; animOn = true; lastT = performance.now(); requestAnimationFrame(tick); }
	function tick(now) {
		var dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; var anyOn = false;
		paramOrder.forEach(function (n) {
			var m = pmeta[n]; if (!m.play) return; anyOn = true;
			var d = dir[n] || 1, span = m.max - m.min, v = P[n] + d * span / 6 * dt;
			if (v > m.max) { v = m.max; dir[n] = -1; } else if (v < m.min) { v = m.min; dir[n] = 1; }
			setParam(n, v);
		});
		refreshParamValues();
		if (anyOn) requestAnimationFrame(tick); else animOn = false;
	}

	/* ---------- box (domain) inputs ---------- */
	function renderDom() {
		Array.prototype.forEach.call($('g3-domain').querySelectorAll('input[data-ax]'), function (inp) { inp.value = G3.fmtn(dom[inp.dataset.ax][+inp.dataset.i]); inp.classList.remove('is-err'); });
	}
	function evalConst(s) { try { var c = G3.compile(s, { P: {}, F: {}, M: M, userFns: {} }); if (c.used.params.length || c.used.x || c.used.y || c.used.z || c.used.u || c.used.v || c.used.t) return NaN; return c.fn(0, 0, 0, 0, 0, 0); } catch (e) { return NaN; } }
	$('g3-domain').addEventListener('input', function (e) {
		var inp = e.target; if (!inp.dataset.ax) return;
		var ax = inp.dataset.ax, row = inp.parentNode.querySelectorAll('input'), lo = evalConst(row[0].value), hi = evalConst(row[1].value);
		var good = isFinite(lo) && isFinite(hi) && lo < hi && hi - lo < 1e7;
		row[0].classList.toggle('is-err', !good); row[1].classList.toggle('is-err', !good);
		if (!good) return;
		dom[ax] = [lo, hi]; domChanged(); saveSoon();
	});
	$('g3-dom-reset').addEventListener('click', function () { dom = cloneDom(DEF_DOM); renderDom(); domChanged(); saveSoon(); });

	/* ---------- 3D engine ---------- */
	var T = null, renderer = null, scene, camera, plotGroup, helperGroup, clips = [], hoverDot, raycaster;
	var canvas = $('g3-canvas'), stage = $('g3-stage'), overlay = $('g3-overlay'), labelBox = $('g3-labels');
	var W = 0, H = 0, S = 10, L = { cx: 0, cy: 0, cz: 0, kx: 1, ky: 1, kz: 1, hx: 5, hy: 5, hz: 5 }, labels = [];
	function colors() {
		return isDark() ? { bg: '#161618', box: '#6a6a74', axis: '#a6a6ae', grid: '#2c2c32', gridMajor: '#3a3a42', ink: '#e8e8ea' }
			: { bg: '#ffffff', box: '#8a919c', axis: '#4a5160', grid: '#e4e7eb', gridMajor: '#cdd2d9', ink: '#1b1b1b' };
	}
	function inkColor(c) { return isDark() && (c === '#1b1b1b' || c === '#000000') ? '#e8e8ea' : c; }
	function layout() {
		var rx = dom.x[1] - dom.x[0], ry = dom.y[1] - dom.y[0], rz = dom.z[1] - dom.z[0], mx = Math.max(rx, ry, rz), mn = Math.min(rx, ry, rz);
		var uniform = mx / mn <= 4;   // similar ranges: true proportions; very different ranges: stretch every axis to a cube
		L.kx = S / (uniform ? mx : rx); L.ky = S / (uniform ? mx : ry); L.kz = S / (uniform ? mx : rz);
		L.cx = (dom.x[0] + dom.x[1]) / 2; L.cy = (dom.y[0] + dom.y[1]) / 2; L.cz = (dom.z[0] + dom.z[1]) / 2;
		L.hx = rx * L.kx / 2; L.hy = ry * L.ky / 2; L.hz = rz * L.kz / 2;
		if (T) {
			var e = 1e-4 * S;
			clips[0].set(new T.Vector3(-1, 0, 0), L.hx + e); clips[1].set(new T.Vector3(1, 0, 0), L.hx + e);
			clips[2].set(new T.Vector3(0, -1, 0), L.hy + e); clips[3].set(new T.Vector3(0, 1, 0), L.hy + e);
			clips[4].set(new T.Vector3(0, 0, -1), L.hz + e); clips[5].set(new T.Vector3(0, 0, 1), L.hz + e);
		}
	}
	function sx(x) { return (x - L.cx) * L.kx; } function sy(y) { return (y - L.cy) * L.ky; } function sz(z) { return (z - L.cz) * L.kz; }
	function V(x, y, z) { return new T.Vector3(sx(x), sy(y), sz(z)); }

	function webglOK() { try { var c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
	function fail(msg) { overlay.hidden = false; overlay.innerHTML = msg; }
	function loadThree(i) {
		var imp;
		try { imp = new Function('u', 'return import(u)'); } catch (e) { return Promise.reject(e); }
		return imp(THREE_URLS[i]).catch(function (e) { if (i + 1 < THREE_URLS.length) return loadThree(i + 1); throw e; });
	}
	function boot() {
		if (!webglOK()) { fail('Your browser or device has WebGL turned off, so the 3D graph cannot be drawn.<br>Try another browser, or turn on hardware acceleration in its settings.'); return; }
		loadThree(0).then(function (mod) {
			try { initEngine(mod); } catch (e) { fail('The 3D graph could not start (' + String(e && e.message || e).replace(/</g, '&lt;') + ').'); if (window.console) console.error(e); }
		}, function () {
			fail('The 3D engine (three.js) could not be loaded from the CDN.<br>Check your connection or any script / ad blocker, then reload the page.');
		});
	}
	function initEngine(mod) {
		T = mod;
		renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
		renderer.localClippingEnabled = true;
		scene = new T.Scene();
		camera = new T.PerspectiveCamera(32, 1, 0.1, 2000); camera.up.set(0, 0, 1);
		for (var i = 0; i < 6; i++) clips.push(new T.Plane(new T.Vector3(1, 0, 0), 0));
		scene.add(new T.HemisphereLight(0xffffff, 0x8a8f99, 1.4));
		headLight = new T.DirectionalLight(0xffffff, 1.9); scene.add(headLight); scene.add(headLight.target);
		helperGroup = new T.Group(); plotGroup = new T.Group(); scene.add(helperGroup); scene.add(plotGroup);
		hoverDot = new T.Mesh(new T.SphereGeometry(0.11, 16, 12), new T.MeshBasicMaterial({ color: 0x111111, depthTest: false }));
		hoverDot.renderOrder = 10; hoverDot.visible = false; scene.add(hoverDot);
		raycaster = new T.Raycaster();
		overlay.hidden = true;
		layout(); resize(true); buildHelpers(); rebuildAll(false); requestRender();
	}
	var headLight = null;

	/* ----- meshes ----- */
	var VIRIDIS = ['#440154', '#3b528b', '#21918c', '#5ec962', '#fde725'];
	var vir = null;
	function heat(s, out) {
		if (!vir) vir = VIRIDIS.map(function (h) { return new T.Color(h); });
		s = Math.max(0, Math.min(1, s)) * (vir.length - 1); var i = Math.min(vir.length - 2, Math.floor(s));
		return out.copy(vir[i]).lerp(vir[i + 1], s - i);
	}
	function heightColors(pos) {
		var n = pos.length / 3, col = new Float32Array(n * 3), c = new T.Color();
		for (var q = 0; q < n; q++) { heat((pos[q * 3 + 2] + L.hz) / (2 * L.hz), c); col[q * 3] = c.r; col[q * 3 + 1] = c.g; col[q * 3 + 2] = c.b; }
		return col;
	}
	function quality(kind, busy) {
		var nSurf = rows.filter(function (r) { return r.show && isSurf(r); }).length;
		if (kind === 'surface') return busy ? 44 : nSurf <= 2 ? 140 : nSurf <= 4 ? 100 : 70;
		if (kind === 'psurface') return busy ? 40 : nSurf <= 2 ? 110 : 80;
		if (kind === 'implicit') return busy ? 28 : nSurf <= 2 ? 60 : 44;
		if (kind === 'curve') return busy ? 500 : 2000;
		return 0;
	}
	function gridGeometry(m) {
		var n = m.pos.length / 3, pos = new Float32Array(n * 3);
		for (var q = 0; q < n; q++) if (m.ok[q]) { pos[q * 3] = sx(m.pos[q * 3]); pos[q * 3 + 1] = sy(m.pos[q * 3 + 1]); pos[q * 3 + 2] = sz(m.pos[q * 3 + 2]); }
		var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setIndex(m.idx); g.computeVertexNormals();
		g.setAttribute('color', new T.BufferAttribute(heightColors(pos), 3));
		// grid lines: about 20 each way along the sample grid
		var nu = m.nu, nv = m.nv, su = Math.max(1, Math.round(nu / 20)), sv = Math.max(1, Math.round(nv / 20)), seg = [];
		function push(p, r) { seg.push(pos[p * 3], pos[p * 3 + 1], pos[p * 3 + 2], pos[r * 3], pos[r * 3 + 1], pos[r * 3 + 2]); }
		function stops(n, st) { var out = []; for (var k = 0; k < n; k += st) out.push(k); out.push(n); return out; }
		stops(nv, sv).forEach(function (j) { for (var i = 0; i < nu; i++) { var a = j * (nu + 1) + i; if (m.ok[a] && m.ok[a + 1] && !m.hb[a]) push(a, a + 1); } });
		stops(nu, su).forEach(function (i) { for (var j = 0; j < nv; j++) { var a = j * (nu + 1) + i; if (m.ok[a] && m.ok[a + nu + 1] && !m.vb[a]) push(a, a + nu + 1); } });
		var lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(new Float32Array(seg), 3));
		return { mesh: g, lines: lg };
	}
	function netsGeometry(m) {
		var n = m.pos.length / 3, pos = new Float32Array(n * 3);
		for (var q = 0; q < n; q++) { pos[q * 3] = sx(m.pos[q * 3]); pos[q * 3 + 1] = sy(m.pos[q * 3 + 1]); pos[q * 3 + 2] = sz(m.pos[q * 3 + 2]); }
		var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setIndex(m.idx); g.computeVertexNormals();
		g.setAttribute('color', new T.BufferAttribute(heightColors(pos), 3));
		return { mesh: g, lines: null };
	}
	function disposeObj(o) {
		if (!o) return;
		o.traverse(function (c) { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); });
		if (o.parent) o.parent.remove(o);
	}
	function surfMaterial(r) {
		var op = r.op, height = r.style === 'h';
		return new T.MeshPhongMaterial({ color: height ? 0xffffff : new T.Color(r.color), vertexColors: height, side: T.DoubleSide, clippingPlanes: clips,
			transparent: op < 0.99, opacity: op, depthWrite: op >= 0.99, shininess: 35, specular: 0x262626,
			polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
	}
	function lineColor(r) { var c = new T.Color(r.style === 'h' ? '#202020' : r.color); if (r.style !== 'h') c.multiplyScalar(0.45); return c; }
	// geometry key: anything that changes the shape. Colour, opacity, style and grid lines only restyle.
	function geoKey(r, busy) {
		var d = r.desc, vals = d.params.map(function (n) { return n + '=' + P[n]; }).join(',');
		var defs = Object.keys(env.userFns).length ? JSON.stringify(P) + rows.map(function (o) { return o.text; }).join('\n') : '';
		return [r.text, vals, defs, JSON.stringify(dom), deg, quality(d.kind, busy)].join('|');
	}
	function buildRow(r, busy) {
		var d = r.desc;
		if (!T || !d || r.err || !r.show || ['surface', 'psurface', 'implicit', 'curve', 'point'].indexOf(d.kind) < 0) { disposeObj(r.obj); r.obj = null; r.key = null; return; }
		var key = geoKey(r, busy);
		if (r.obj && r.key === key) { restyle(r); return; }
		disposeObj(r.obj); r.obj = null; r.key = key; r.lbl = null;
		var grp = new T.Group(), n = quality(d.kind, busy), geo;
		try {
			if (d.kind === 'surface' || d.kind === 'psurface' || d.kind === 'implicit') {
				geo = d.kind === 'surface' ? gridGeometry(G3.surfaceMesh(d, dom, n)) : d.kind === 'psurface' ? gridGeometry(G3.psurfaceMesh(d, dom, n)) : netsGeometry(G3.implicitMesh(d, dom, n));
				var mesh = new T.Mesh(geo.mesh, surfMaterial(r)); mesh.userData.row = r.id; mesh.userData.pick = true; grp.add(mesh);
				var lines;
				if (geo.lines) lines = new T.LineSegments(geo.lines, new T.LineBasicMaterial({ color: lineColor(r), transparent: true, opacity: 0.5, clippingPlanes: clips }));
				else lines = new T.Mesh(geo.mesh, new T.MeshBasicMaterial({ color: lineColor(r), wireframe: true, transparent: true, opacity: 0.22, clippingPlanes: clips }));
				lines.userData.wire = true; grp.add(lines);
			} else if (d.kind === 'curve') {
				var rad = 0.045 * S / 10;
				G3.curvePieces(d, dom, n).forEach(function (pc) {
					var pts = pc.map(function (p) { return V(p[0], p[1], p[2]); });
					var curve = new T.CatmullRomCurve3(pts, false, 'centripetal'); curve.arcLengthDivisions = Math.max(200, pts.length * 2);
					grp.add(new T.Mesh(new T.TubeGeometry(curve, Math.min(4000, pts.length * 2), rad, 8, false),
						new T.MeshPhongMaterial({ color: new T.Color(inkColor(r.color)), clippingPlanes: clips, shininess: 40 })));
				});
			} else if (d.kind === 'point') {
				if ([d.x, d.y, d.z].every(isFinite) && inBox(d.x, d.y, d.z)) {
					var sp = new T.Mesh(new T.SphereGeometry(0.16, 20, 14), new T.MeshPhongMaterial({ color: new T.Color(inkColor(r.color)) }));
					sp.position.copy(V(d.x, d.y, d.z)); grp.add(sp);
					r.lbl = { p: sp.position.clone(), text: '(' + G3.fmtn(d.x) + ', ' + G3.fmtn(d.y) + ', ' + G3.fmtn(d.z) + ')' };
				}
			}
		} catch (e) { disposeObj(grp); r.obj = null; r.key = null; return; }   // a row that throws while meshing just does not draw
		r.obj = grp; plotGroup.add(grp); restyle(r, true);
	}
	function inBox(x, y, z) { return x >= dom.x[0] && x <= dom.x[1] && y >= dom.y[0] && y <= dom.y[1] && z >= dom.z[0] && z <= dom.z[1]; }
	function restyle(r, quiet) {
		if (!T) return;
		if (!r.obj) { if (r.show && r.desc && !r.err && !quiet) scheduleBuild(false); return; }
		r.obj.visible = r.show;
		r.obj.children.forEach(function (c) {
			if (c.userData.wire) { c.visible = wireOn(r); c.material.color.copy(lineColor(r)); c.material.opacity = (c.isLineSegments ? 0.5 : 0.22) * Math.max(0.35, r.op); return; }
			if (c.userData.pick) {
				var height = r.style === 'h';
				if (c.material.vertexColors !== height) { c.material.vertexColors = height; c.material.needsUpdate = true; }
				c.material.color.set(height ? 0xffffff : r.color);
				var tr = r.op < 0.99; if (c.material.transparent !== tr) { c.material.transparent = tr; c.material.depthWrite = !tr; c.material.needsUpdate = true; }
				c.material.opacity = r.op;
			} else if (c.material) { c.material.color.set(inkColor(r.color)); c.material.transparent = r.op < 0.99; c.material.opacity = r.op; }
		});
		if (!quiet) { syncLabels(); requestRender(); }
	}

	/* ----- rebuild scheduling: coarse while sliders move / animate, fine shortly after ----- */
	var buildPending = false, buildBusy = false, fineTimer = null;
	function scheduleBuild(busy) {
		if (!T) return;
		buildBusy = buildBusy || !!busy;
		if (!buildPending) { buildPending = true; requestAnimationFrame(function () { buildPending = false; var b = buildBusy; buildBusy = false; rebuildAll(b); }); }
		clearTimeout(fineTimer);
		if (busy) fineTimer = setTimeout(function () { scheduleBuild(false); }, 260);
	}
	function rebuildAll(busy) {
		if (!T) return;
		var live = {};
		rows.forEach(function (r) { live[r.id] = 1; buildRow(r, busy); });
		plotGroup.children.slice().forEach(function (g) { var keep = rows.some(function (r) { return r.obj === g; }); if (!keep) disposeObj(g); });
		syncLabels(); requestRender();
	}

	/* ----- box, grid, axes, labels ----- */
	function lineSeg(pts, color, opacity) {
		var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(new Float32Array(pts), 3));
		return new T.LineSegments(g, new T.LineBasicMaterial({ color: new T.Color(color), transparent: opacity < 1, opacity: opacity == null ? 1 : opacity }));
	}
	function buildHelpers() {
		if (!T) return;
		helperGroup.children.slice().forEach(disposeObj);
		var c = colors(), hx = L.hx, hy = L.hy, hz = L.hz, tx = G3.ticks(dom.x[0], dom.x[1], 6), ty = G3.ticks(dom.y[0], dom.y[1], 6), tz = G3.ticks(dom.z[0], dom.z[1], 6);
		renderer.setClearColor(new T.Color(c.bg), 1);
		var floor = opts.box ? -hz : Math.max(-hz, Math.min(hz, sz(0)));
		if (opts.grid) {
			var gp = [], gm = [];
			// minor lines at a fifth of the tick step (when not too dense), major lines at the ticks
			[[tx, 'x'], [ty, 'y']].forEach(function (pair) {
				var t = pair[0], ax = pair[1], minor = t.step / 5, lo = dom[ax][0], hi = dom[ax][1];
				var count = (hi - lo) / minor;
				for (var k = Math.ceil(lo / minor - 1e-9); k * minor <= hi + 1e-9; k++) {
					var v = k * minor, major = Math.abs(Math.round(k / 5) * 5 - k) < 1e-9;
					if (!major && count > 80) continue;
					var arr = major ? gm : gp;
					if (ax === 'x') arr.push(sx(v), -hy, floor, sx(v), hy, floor); else arr.push(-hx, sy(v), floor, hx, sy(v), floor);
				}
			});
			helperGroup.add(lineSeg(gp, c.grid, 1)); helperGroup.add(lineSeg(gm, c.gridMajor, 1));
		}
		if (opts.box) {
			var e = [];
			[[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (p, i, a) {
				var q = a[(i + 1) % 4];
				e.push(p[0] * hx, p[1] * hy, -hz, q[0] * hx, q[1] * hy, -hz, p[0] * hx, p[1] * hy, hz, q[0] * hx, q[1] * hy, hz, p[0] * hx, p[1] * hy, -hz, p[0] * hx, p[1] * hy, hz);
			});
			helperGroup.add(lineSeg(e, c.box, 1));
		} else {
			var ox = Math.max(-hx, Math.min(hx, sx(0))), oy = Math.max(-hy, Math.min(hy, sy(0))), oz = Math.max(-hz, Math.min(hz, sz(0)));
			helperGroup.add(lineSeg([-hx, oy, oz, hx, oy, oz, ox, -hy, oz, ox, hy, oz, ox, oy, -hz, ox, oy, hz], c.axis, 1));
			var cone = new T.ConeGeometry(0.12, 0.42, 14), cm = new T.MeshBasicMaterial({ color: new T.Color(c.axis) });
			[[hx, oy, oz, 0, 0, -Math.PI / 2], [ox, hy, oz, 0, 0, 0], [ox, oy, hz, Math.PI / 2, 0, 0]].forEach(function (a, i) {
				var m = new T.Mesh(i ? cone.clone() : cone, cm.clone()); m.position.set(a[0], a[1], a[2]); m.rotation.set(a[3], a[4], a[5]); helperGroup.add(m);
			});
		}
		// labels
		labels.forEach(function (l) { l.el.remove(); }); labels = [];
		function addLabel(text, cls, fn) { var el = document.createElement('span'); el.className = 'g3-label' + (cls ? ' ' + cls : ''); el.textContent = text; labelBox.appendChild(el); labels.push({ el: el, fn: fn }); }
		var off = 0.55;
		if (opts.box) {
			// x ticks along the bottom edge on the camera's side of y, y ticks along the camera's side of x, z ticks up the leftmost vertical edge
			tx.values.forEach(function (v) { addLabel(G3.fmtn(v), '', function (s) { return [sx(v), s.ys * (hy + off), -hz]; }); });
			ty.values.forEach(function (v) { addLabel(G3.fmtn(v), '', function (s) { return [s.xs * (hx + off), sy(v), -hz]; }); });
			tz.values.forEach(function (v) { addLabel(G3.fmtn(v), '', function (s) { return [s.zc[0] * (hx + off * 0.7), s.zc[1] * (hy + off * 0.7), sz(v)]; }); });
			addLabel('x', 'g3-label--axis', function (s) { return [0, s.ys * (hy + off * 2.6), -hz]; });
			addLabel('y', 'g3-label--axis', function (s) { return [s.xs * (hx + off * 2.6), 0, -hz]; });
			addLabel('z', 'g3-label--axis', function (s) { return [s.zc[0] * (hx + off * 1.6), s.zc[1] * (hy + off * 1.6), 0]; });
		} else {
			var ox2 = Math.max(-hx, Math.min(hx, sx(0))), oy2 = Math.max(-hy, Math.min(hy, sy(0))), oz2 = Math.max(-hz, Math.min(hz, sz(0)));
			tx.values.forEach(function (v) { if (v !== 0) addLabel(G3.fmtn(v), '', function () { return [sx(v), oy2 - off * 0.8, oz2]; }); });
			ty.values.forEach(function (v) { if (v !== 0) addLabel(G3.fmtn(v), '', function () { return [ox2 - off * 0.8, sy(v), oz2]; }); });
			tz.values.forEach(function (v) { if (v !== 0) addLabel(G3.fmtn(v), '', function () { return [ox2 - off * 0.6, oy2 - off * 0.6, sz(v)]; }); });
			addLabel('x', 'g3-label--axis', function () { return [hx + off * 1.4, oy2, oz2]; });
			addLabel('y', 'g3-label--axis', function () { return [ox2, hy + off * 1.4, oz2]; });
			addLabel('z', 'g3-label--axis', function () { return [ox2, oy2, hz + off * 1.4]; });
		}
		syncLabels(); requestRender();
	}
	var pointLabels = [];
	function syncLabels() {
		pointLabels.forEach(function (l) { l.el.remove(); }); pointLabels = [];
		rows.forEach(function (r) {
			if (!r.show || !r.lbl || !r.obj) return;
			var el = document.createElement('span'); el.className = 'g3-label g3-label--pt'; el.textContent = r.lbl.text; labelBox.appendChild(el);
			var p = r.lbl.p; pointLabels.push({ el: el, fn: function () { return [p.x, p.y, p.z]; }, dx: 10, dy: -12, left: true });
		});
	}
	var tmpV = null;
	function placeLabels() {
		if (!tmpV) tmpV = new T.Vector3();
		var cp = camera.position, side = { xs: cp.x < 0 ? -1 : 1, ys: cp.y < 0 ? -1 : 1, zc: [1, 1] }, best = Infinity;
		// z labels: the vertical box edge that is furthest left on screen
		[[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (c) { tmpV.set(c[0] * L.hx, c[1] * L.hy, 0).project(camera); if (tmpV.x < best) { best = tmpV.x; side.zc = c; } });
		labels.concat(pointLabels).forEach(function (l) {
			var p = l.fn(side); tmpV.set(p[0], p[1], p[2]).project(camera);
			if (tmpV.z > 1 || tmpV.z < -1) { l.el.style.visibility = 'hidden'; return; }
			var x = (tmpV.x + 1) / 2 * W, y = (1 - tmpV.y) / 2 * H;
			l.el.style.visibility = '';
			l.el.style.transform = l.left ? 'translate(' + (x + l.dx).toFixed(1) + 'px,' + (y + l.dy).toFixed(1) + 'px) translateY(-50%)' : 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-50%)';
			l.sx = x; l.sy = y;
		});
	}

	/* ----- camera ----- */
	function radius() { return Math.sqrt(L.hx * L.hx + L.hy * L.hy + L.hz * L.hz); }
	function fitDist() {
		var v = camera.fov * Math.PI / 180, h = 2 * Math.atan(Math.tan(v / 2) * camera.aspect);
		return radius() * 1.04 / Math.sin(Math.min(v, h) / 2);
	}
	function updateCamera() {
		var th = cam.theta * Math.PI / 180, ph = cam.phi * Math.PI / 180, d = cam.dist || fitDist();
		camera.position.set(cam.tx + d * Math.cos(ph) * Math.cos(th), cam.ty + d * Math.cos(ph) * Math.sin(th), cam.tz + d * Math.sin(ph));
		camera.lookAt(cam.tx, cam.ty, cam.tz); camera.updateMatrixWorld();
		// head light: above and to the left of the camera, so shading stays readable while rotating
		var right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
		headLight.position.copy(camera.position).addScaledVector(up, d * 0.6).addScaledVector(right, -d * 0.35);
		headLight.target.position.set(cam.tx, cam.ty, cam.tz);
	}
	var VIEWS = { home: [30, 24], iso: [45, 35.264], top: [-90, 89.9], front: [-90, 0], side: [0, 0] };
	var tween = null;
	function goView(name, keepTarget) {
		var v = VIEWS[name], th0 = cam.theta, dth = ((v[0] - th0) % 360 + 540) % 360 - 180;
		tween = { t0: performance.now(), from: [th0, cam.phi, cam.dist || (T ? fitDist() : 0), cam.tx, cam.ty, cam.tz], to: [th0 + dth, v[1], T ? fitDist() : 0, keepTarget ? cam.tx : 0, keepTarget ? cam.ty : 0, keepTarget ? cam.tz : 0], fit: true };
		if (!T) { cam = { theta: v[0], phi: v[1], dist: 0, tx: 0, ty: 0, tz: 0 }; tween = null; }
		requestRender(); saveSoon();
	}
	function homeView() { if (T && renderer) goView('home'); else cam = { theta: 30, phi: 24, dist: 0, tx: 0, ty: 0, tz: 0 }; }

	/* ----- render loop (on demand; continuous only while spinning / tweening) ----- */
	var needRender = false, lastFrame = 0;
	function requestRender() { if (!T || needRender) return; needRender = true; requestAnimationFrame(frame); }
	function frame(now) {
		needRender = false;
		var dt = lastFrame ? Math.min(0.1, (now - lastFrame) / 1000) : 0; lastFrame = now;
		if (tween) {
			var k = Math.min(1, (now - tween.t0) / 380), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2, f = tween.from, t = tween.to;
			cam.theta = f[0] + (t[0] - f[0]) * e; cam.phi = f[1] + (t[1] - f[1]) * e; cam.dist = f[2] + (t[2] - f[2]) * e;
			cam.tx = f[3] + (t[3] - f[3]) * e; cam.ty = f[4] + (t[4] - f[4]) * e; cam.tz = f[5] + (t[5] - f[5]) * e;
			if (k >= 1) { if (tween.fit) cam.dist = 0; tween = null; cam.theta = ((cam.theta % 360) + 360) % 360; }
		}
		if (opts.spin && !dragging) cam.theta = (cam.theta + dt * 18) % 360;
		draw();
		if (tween || opts.spin) requestRender(); else lastFrame = 0;
	}
	function draw() { updateCamera(); renderer.render(scene, camera); placeLabels(); }

	function resize(force) {
		var r = stage.getBoundingClientRect(), nw = Math.max(50, Math.round(r.width)), nh = Math.max(50, Math.round(r.height));
		if (!renderer || (!force && nw === W && nh === H)) return;
		W = nw; H = nh;
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(W, H, false);
		camera.aspect = W / H; camera.updateProjectionMatrix(); requestRender();
	}

	/* ----- interaction: orbit / pan / zoom / pinch, hover readout ----- */
	var pointers = {}, drag = null, pinch = null, dragging = false;
	function localPos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
	function zoomBy(f) { if (!T) return; var d = (cam.dist || fitDist()) * f, R = radius(); cam.dist = Math.max(R * 0.15, Math.min(R * 30, d)); tween = null; requestRender(); saveSoon(); }
	function panBy(dx, dy) {
		var d = cam.dist || fitDist(), per = 2 * d * Math.tan(camera.fov * Math.PI / 360) / H;
		var right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0), up = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
		cam.tx += (-dx * right.x + dy * up.x) * per; cam.ty += (-dx * right.y + dy * up.y) * per; cam.tz += (-dx * right.z + dy * up.z) * per;
	}
	function rotateBy(dx, dy) { cam.theta -= dx * 0.45; cam.phi = Math.max(-89.9, Math.min(89.9, cam.phi + dy * 0.45)); }
	canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
	canvas.addEventListener('pointerdown', function (e) {
		if (!T) return;
		try { canvas.setPointerCapture(e.pointerId); } catch (err) {} var p = localPos(e); pointers[e.pointerId] = p; canvas.focus({ preventScroll: true });
		tween = null; dragging = true; hideHover();
		var ids = Object.keys(pointers);
		if (ids.length === 1) drag = { x: p.x, y: p.y, pan: e.button === 2 || e.button === 1 || e.shiftKey || e.ctrlKey || e.metaKey };
		else if (ids.length === 2) { var a = pointers[ids[0]], b = pointers[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, dist: cam.dist || fitDist(), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; drag = null; }
	});
	canvas.addEventListener('pointermove', function (e) {
		if (!T) return;
		var p = localPos(e);
		if (pointers[e.pointerId]) {
			var old = pointers[e.pointerId]; pointers[e.pointerId] = p; var ids = Object.keys(pointers);
			if (ids.length === 2 && pinch) {
				var a = pointers[ids[0]], b = pointers[ids[1]], mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, R = radius();
				cam.dist = Math.max(R * 0.15, Math.min(R * 30, pinch.dist * pinch.d / (Math.hypot(a.x - b.x, a.y - b.y) || 1)));
				panBy(mx - pinch.mx, my - pinch.my); pinch.mx = mx; pinch.my = my;
			} else if (drag) {
				if (drag.pan) panBy(p.x - old.x, p.y - old.y); else rotateBy(p.x - old.x, p.y - old.y);
			}
			requestRender(); return;
		}
		hoverAt(p);
	});
	function endPointer(e) {
		delete pointers[e.pointerId]; var ids = Object.keys(pointers); pinch = null;
		if (ids.length === 1) drag = { x: pointers[ids[0]].x, y: pointers[ids[0]].y, pan: false }; else { drag = null; dragging = false; saveSoon(); }
	}
	canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
	canvas.addEventListener('pointerleave', function () { hideHover(); });
	canvas.addEventListener('wheel', function (e) { if (!T) return; e.preventDefault(); zoomBy(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0012))); }, { passive: false });
	canvas.addEventListener('keydown', function (e) {
		if (!T) return;
		var k = e.key;
		if (k === 'ArrowLeft') rotateBy(-12, 0); else if (k === 'ArrowRight') rotateBy(12, 0); else if (k === 'ArrowUp') rotateBy(0, -12); else if (k === 'ArrowDown') rotateBy(0, 12);
		else if (k === '+' || k === '=') { zoomBy(0.85); return; } else if (k === '-' || k === '_') { zoomBy(1 / 0.85); return; }
		else if (k === '0') { homeView(); return; } else return;
		e.preventDefault(); tween = null; requestRender(); saveSoon();
	});
	var hoverPending = null;
	function hideHover() { $('g3-readout').textContent = ''; if (hoverDot && hoverDot.visible) { hoverDot.visible = false; requestRender(); } }
	function hoverAt(p) {
		if (hoverPending) { hoverPending = p; return; }
		hoverPending = p;
		requestAnimationFrame(function () {
			var q = hoverPending; hoverPending = null; if (!q || dragging) return;
			var meshes = []; rows.forEach(function (r) { if (r.show && r.obj) r.obj.children.forEach(function (c) { if (c.userData.pick) meshes.push(c); }); });
			if (!meshes.length) { hideHover(); return; }
			raycaster.setFromCamera(new T.Vector2(q.x / W * 2 - 1, -(q.y / H) * 2 + 1), camera);
			var hits = raycaster.intersectObjects(meshes, false), e = 1e-3 * S, hit = null;
			for (var i = 0; i < hits.length; i++) { var h = hits[i].point; if (Math.abs(h.x) <= L.hx + e && Math.abs(h.y) <= L.hy + e && Math.abs(h.z) <= L.hz + e) { hit = hits[i]; break; } }
			if (!hit) { hideHover(); return; }
			var r = rowById(hit.object.userData.row), X = hit.point.x / L.kx + L.cx, Y = hit.point.y / L.ky + L.cy, Z = hit.point.z / L.kz + L.cz;
			hoverDot.position.copy(hit.point); hoverDot.material.color.set(isDark() ? 0xffffff : 0x111111); hoverDot.visible = true;
			$('g3-readout').textContent = '(' + fmt4(X) + ', ' + fmt4(Y) + ', ' + fmt4(Z) + ')' + (r ? '   row ' + (rows.indexOf(r) + 1) : '');
			requestRender();
		});
	}

	/* ---------- toolbar ---------- */
	$('g3-home').addEventListener('click', function () { homeView(); });
	Array.prototype.forEach.call(document.querySelectorAll('.g3-toolbar [data-view]'), function (b) { b.addEventListener('click', function () { goView(b.dataset.view); }); });
	function paintToggles() {
		$('g3-spin').setAttribute('aria-pressed', String(opts.spin));
		$('g3-grid').setAttribute('aria-pressed', String(opts.grid));
		$('g3-box').textContent = opts.box ? 'Box' : 'Axes';
		$('g3-box').title = opts.box ? 'Showing a box: click for axes through the origin' : 'Showing axes: click for a box';
	}
	$('g3-spin').addEventListener('click', function () { opts.spin = !opts.spin; paintToggles(); requestRender(); });
	$('g3-box').addEventListener('click', function () { opts.box = !opts.box; paintToggles(); buildHelpers(); saveSoon(); });
	$('g3-grid').addEventListener('click', function () { opts.grid = !opts.grid; paintToggles(); buildHelpers(); saveSoon(); });
	function setDeg() { M.deg = deg; $('g3-deg').textContent = deg ? 'Deg' : 'Rad'; $('g3-deg').setAttribute('aria-pressed', String(deg)); }
	$('g3-deg').addEventListener('click', function () { deg = !deg; setDeg(); changed(); });
	$('g3-png').addEventListener('click', function () {
		if (!T) { toast('The 3D graph is not ready yet'); return; }
		draw();   // render and copy in the same task, so the WebGL buffer is still there
		var out = document.createElement('canvas'), pr = renderer.getPixelRatio(); out.width = canvas.width; out.height = canvas.height;
		var ctx = out.getContext('2d'); ctx.drawImage(canvas, 0, 0);
		ctx.scale(pr, pr); ctx.textBaseline = 'middle';
		labels.concat(pointLabels).forEach(function (l) {
			if (l.el.style.visibility === 'hidden' || l.sx == null) return;
			var cs = getComputedStyle(l.el); ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily; ctx.fillStyle = cs.color;
			ctx.textAlign = l.left ? 'left' : 'center'; ctx.fillText(l.el.textContent, l.sx + (l.left ? l.dx : 0), l.sy + (l.left ? l.dy : 0));
		});
		out.toBlob(function (b) { if (!b) return; var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mes-graph-3d.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); });
	});
	$('g3-link').addEventListener('click', function () { copy(location.origin + location.pathname + '?s=' + encodeURIComponent(encode(snapshot())), 'Link copied'); });
	function paintTheatre() { $('g3-theatre').setAttribute('aria-pressed', String(document.documentElement.classList.contains('page-theatre'))); }
	$('g3-theatre').addEventListener('click', function () {
		var on = document.documentElement.classList.toggle('page-theatre');
		try { localStorage.setItem('pageMode', on ? 'theatre' : 'std'); localStorage.setItem('pageWide', on ? '1' : '0'); } catch (e) {}
		paintTheatre(); setTimeout(function () { resize(); }, 60);
	});
	paintTheatre();
	$('g3-full').addEventListener('click', function () { if (document.fullscreenElement) document.exitFullscreen(); else if (stage.requestFullscreen) stage.requestFullscreen(); });
	document.addEventListener('fullscreenchange', function () { setTimeout(function () { resize(); }, 50); });
	if (window.ResizeObserver) new ResizeObserver(function () { resize(); }).observe(stage); else window.addEventListener('resize', function () { resize(); });
	// the site's moon button toggles body.dark-mode: recolour the background, grid and labels
	var wasDark = isDark();
	new MutationObserver(function () { if (isDark() === wasDark) return; wasDark = isDark(); if (T) { buildHelpers(); rows.forEach(function (r) { restyle(r, true); }); rebuildAll(false); } }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

	/* ---------- change pipeline ---------- */
	function changed() { compileAll(); rows.forEach(updateMsg); renderParams(false); scheduleBuild(false); saveSoon(); }
	function domChanged() { layout(); if (T) { buildHelpers(); rows.forEach(function (r) { r.key = null; }); scheduleBuild(false); } }

	/* ---------- start-up ---------- */
	var q = new URLSearchParams(location.search), s = null;
	if (q.get('s')) s = decode(q.get('s'));
	else if (q.getAll('f').length) s = { r: q.getAll('f').map(function (t) { return [t.slice(0, 500)]; }) };
	else { try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; } }
	if (s && s.r && s.r.length) restore(s); else DEFAULT_ROWS.forEach(function (t) { addRow(t); });
	activeId = rows[0].id; setDeg(); paintToggles(); layout(); renderDom();
	renderRows(); compileAll(); rows.forEach(updateMsg); renderParams(true);
	// three.js is only fetched once the page is interactive
	(window.requestIdleCallback || function (f) { return setTimeout(f, 1); })(boot, { timeout: 700 });
})();
