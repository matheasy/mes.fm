/* MES 2D Graphing Calculator UI (compiler + numerics are in lib.js, prepended above as GC) */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var KEY = 'mes-graph2d:v1';
	var PALETTE = ['#c74440', '#2d70b3', '#388c46', '#6042a6', '#fa7e19', '#1b1b1b', '#e0409a', '#00968a'];
	var EXAMPLES = [
		['Parabola', ['y = x^2 - 2']],
		['Sine wave with sliders', ['a = 1', 'b = 1', 'y = a sin(b x)']],
		['Quadratic: vertex form', ['a = 1', 'h = 0', 'k = 0', 'y = a(x - h)^2 + k']],
		['Circle and line', ['x^2 + y^2 = 9', 'y = x + 1']],
		['Ellipse', ['x^2/9 + y^2/4 = 1']],
		['Floor and ceiling', ['y = ⌊x⌋', 'y = ⌈x⌉']],
		['Absolute value', ['y = |x - 2| - 1']],
		['Tangent', ['y = tan(x)']],
		['Cubic with roots', ['y = x^3 - 3x + 1']],
		['Exponential and log', ['y = e^x', 'y = ln(x)', 'y = x']],
		['Normal curve', ['y = e^(-x^2/2)/sqrt(2π)']],
		['Piecewise', ['y = x^2 {x<0}', 'y = x {x>=0}']],
		['Inequality region', ['y > x^2 - 2', 'y < 3']],
		['Heart', ['(x^2 + y^2 - 1)^3 = x^2 y^3']],
		['Parametric: circle', ['(2cos(t), 2sin(t))']],
		['Lissajous figure', ['(sin(3t), sin(2t))']],
		['Polar rose', ['k = 3', 'r = 3cos(kθ)']],
		['Spiral', ['r = θ/2 {0<=θ<=6π}']]
	];
	var DEFAULT_ROWS = ['y = x^2 - 2', 'a = 1', 'y = a sin(x)'];

	var rows = [], nextId = 1, activeId = null, view = { cx: 0, cy: 0, sx: 40, sy: 40 }, deg = false;
	var P = {}, pmeta = {}, F = {}, M = GC.makeM(), env = { P: P, F: F, M: M, userFns: {} };
	var toastTimer;
	function toast(msg) { var t = $('gc-toast'); t.textContent = msg; t.classList.add('tu-toast--show'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 1500); }
	function copy(text, msg) {
		function done() { toast(msg || 'Copied'); }
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
		function fallback() { var ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } document.body.removeChild(ta); }
	}
	function isDark() { return document.body.classList.contains('dark-mode'); }

	/* ---------- state: rows, URL, localStorage ---------- */
	function pickColor() { var used = rows.map(function (r) { return r.color; }); for (var i = 0; i < PALETTE.length; i++) if (used.indexOf(PALETTE[i]) < 0) return PALETTE[i]; return PALETTE[rows.length % PALETTE.length]; }
	function addRow(text, color, show) { var r = { id: nextId++, text: text || '', color: color || pickColor(), show: show !== false, desc: null, err: '' }; rows.push(r); return r; }
	function snapshot() {
		var pm = {}; Object.keys(pmeta).forEach(function (k) { pm[k] = [P[k], pmeta[k].min, pmeta[k].max]; });
		return { r: rows.map(function (r) { return [r.text, r.color, r.show ? 1 : 0]; }), v: [view.cx, view.cy, view.sx, view.sy], d: deg ? 1 : 0, p: pm };
	}
	function restore(s) {
		rows = []; (s.r || []).forEach(function (a) { addRow(a[0], a[1], a[2] !== 0); });
		if (s.v && s.v.every(isFinite)) view = { cx: s.v[0], cy: s.v[1], sx: s.v[2], sy: s.v[3] };
		deg = !!s.d; M.deg = deg;
		Object.keys(s.p || {}).forEach(function (k) { P[k] = s.p[k][0]; pmeta[k] = { min: s.p[k][1], max: s.p[k][2], play: false }; });
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
		rows.forEach(function (r) { var m = /^\s*([A-Za-z])\s*\(\s*[A-Za-z]\s*\)\s*=/.exec(r.text); if (m) { env.userFns[m[1]] = true; F[m[1]] = function () { return NaN; }; } });
		var defined = {}, used = [];
		rows.forEach(function (r) {
			r.err = ''; r.desc = null;
			try {
				r.desc = GC.analyze(r.text, env);
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
	function rng(d, v) { var lo = d.tRange && d.tRange.lo != null ? d.tRange.lo : 0, hi = d.tRange && d.tRange.hi != null ? d.tRange.hi : 2 * Math.PI; return '[' + (lo === 0 ? '0' : GC.fmtn(lo)) + ', ' + (hi === 2 * Math.PI ? '2π' : GC.fmtn(hi)) + ']'; }
	function describe(r) {
		if (r.err) return r.err;
		var d = r.desc; if (!d) return '';
		return ({ empty: '', func: d.def ? 'function ' + d.def + '(x)' : 'function', xfunc: 'x as a function of y', implicit: 'curve', ineq: 'region', parametric: 'parametric curve, t ∈ ' + rng(d, 't'),
			polar: 'polar curve, θ ∈ ' + rng(d, 'θ'), point: '(' + GC.fmtn(d.x) + ', ' + GC.fmtn(d.y) + ')', param: 'slider ' + d.name + ' = ' + GC.fmtn(d.value) })[d.kind] || '';
	}

	/* ---------- rows UI ---------- */
	var lastInput = null;
	function autosize(t) { if (!t) return; t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; }
	function autosizeAll() { Array.prototype.forEach.call(document.querySelectorAll('.gc-in'), autosize); }
	window.addEventListener('resize', autosizeAll);
	if (window.ResizeObserver) { var __rw = 0; new ResizeObserver(function (en) { var w = Math.round(en[0].contentRect.width); if (w !== __rw) { __rw = w; autosizeAll(); } }).observe(document.getElementById('gc-rows')); }
	function renderRows() {
		var box = $('gc-rows'); box.innerHTML = '';
		rows.forEach(function (r) {
			var el = document.createElement('div'); el.className = 'gc-row' + (r.id === activeId ? ' is-active' : ''); el.dataset.id = r.id;
			el.innerHTML = '<input type="color" class="gc-color" aria-label="Colour" value="' + r.color + '">' +
				'<div class="gc-rowmain"><textarea class="gc-in" rows="1" wrap="soft" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" placeholder="y = x^2" aria-label="Expression"></textarea><div class="gc-msg"></div></div>' +
				'<button type="button" class="gc-ibtn gc-eye" aria-label="Show or hide" aria-pressed="' + r.show + '" title="Show / hide">◉</button>' +
				'<button type="button" class="gc-ibtn gc-del" aria-label="Delete" title="Delete">✕</button>';
			el.querySelector('.gc-in').value = r.text;
			box.appendChild(el); autosize(el.querySelector('.gc-in')); updateMsg(r);
		});
	}
	function rowEl(r) { return $('gc-rows').querySelector('[data-id="' + r.id + '"]'); }
	function updateMsg(r) { var el = rowEl(r); if (!el) return; var m = el.querySelector('.gc-msg'); m.textContent = describe(r); m.className = 'gc-msg' + (r.err ? ' is-err' : ''); }
	function rowById(id) { for (var i = 0; i < rows.length; i++) if (rows[i].id === +id) return rows[i]; return null; }
	function setActive(id) { activeId = id; Array.prototype.forEach.call($('gc-rows').children, function (el) { el.classList.toggle('is-active', +el.dataset.id === id); }); scheduleKeys(); }
	var boxRows = $('gc-rows');
	boxRows.addEventListener('input', function (e) {
		var el = e.target.closest('.gc-row'); if (!el) return; var r = rowById(el.dataset.id);
		if (e.target.classList.contains('gc-in')) { if (/[\r\n]/.test(e.target.value)) e.target.value = e.target.value.replace(/[\r\n]+/g, ' '); autosize(e.target); r.text = e.target.value; changed(); }
		else if (e.target.classList.contains('gc-color')) { r.color = e.target.value; draw(); saveSoon(); }
	});
	boxRows.addEventListener('focusin', function (e) { var el = e.target.closest('.gc-row'); if (!el) return; if (e.target.classList.contains('gc-in')) lastInput = e.target; setActive(+el.dataset.id); });
	boxRows.addEventListener('click', function (e) {
		var el = e.target.closest('.gc-row'); if (!el) return; var r = rowById(el.dataset.id);
		if (e.target.closest('.gc-eye')) { r.show = !r.show; e.target.closest('.gc-eye').setAttribute('aria-pressed', String(r.show)); draw(); scheduleKeys(); saveSoon(); }
		else if (e.target.closest('.gc-del')) {
			rows = rows.filter(function (x) { return x !== r; }); if (!rows.length) addRow('');
			if (activeId === r.id) activeId = rows[rows.length - 1].id;
			renderRows(); changed(true);
		}
	});
	boxRows.addEventListener('keydown', function (e) {
		if (e.key === 'Enter' && e.target.classList.contains('gc-in')) {
			e.preventDefault(); var el = e.target.closest('.gc-row'), r = rowById(el.dataset.id), idx = rows.indexOf(r);
			var nr = addRow(''); rows.splice(rows.length - 1, 1); rows.splice(idx + 1, 0, nr); renderRows(); changed(true);
			var inp = rowEl(nr).querySelector('.gc-in'); inp.focus();
		}
	});
	$('gc-add').addEventListener('click', function () { var r = addRow(''); renderRows(); changed(true); rowEl(r).querySelector('.gc-in').focus(); });
	$('gc-clear').addEventListener('click', function () { rows = []; Object.keys(P).forEach(function (k) { delete P[k]; }); pmeta = {}; var r = addRow(''); activeId = r.id; renderRows(); changed(true); rowEl(r).querySelector('.gc-in').focus(); });
	var ex = $('gc-examples'); ex.innerHTML = '<option value="">Examples…</option>' + EXAMPLES.map(function (e, i) { return '<option value="' + i + '">' + e[0] + '</option>'; }).join('');
	ex.addEventListener('change', function () {
		if (ex.value === '') return; var e = EXAMPLES[+ex.value]; ex.value = '';
		rows = []; Object.keys(P).forEach(function (k) { delete P[k]; }); pmeta = {};
		e[1].forEach(function (t) { addRow(t); }); activeId = rows[rows.length - 1].id; renderRows(); homeView(); changed(true);
	});
	$('gc-keys').addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
	$('gc-keys').addEventListener('click', function (e) {
		var b = e.target.closest('button'); if (!b) return;
		var inp = lastInput && document.body.contains(lastInput) ? lastInput : $('gc-rows').querySelector('.gc-in'); if (!inp) return;
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
		shownParams = sig; var box = $('gc-params');
		if (!paramOrder.length) { box.innerHTML = ''; return; }
		box.innerHTML = '<h3>Sliders</h3>' + paramOrder.map(function (n) {
			var m = pmeta[n];
			return '<div class="gc-param" data-n="' + n + '"><b>' + n + '</b><input type="range" min="' + m.min + '" max="' + m.max + '" step="any" value="' + P[n] + '" aria-label="Value of ' + n + '">' +
				'<input class="gc-num" type="text" inputmode="decimal" value="' + GC.fmtn(P[n]) + '" aria-label="' + n + ' value"><button type="button" class="gc-ibtn gc-play" aria-pressed="' + !!m.play + '" title="Animate" aria-label="Animate ' + n + '">▶</button>' +
				'<div class="gc-lim"><span>min <input class="gc-min" type="text" inputmode="decimal" value="' + m.min + '"></span><span>max <input class="gc-max" type="text" inputmode="decimal" value="' + m.max + '"></span></div></div>';
		}).join('');
	}
	function refreshParamValues() {
		Array.prototype.forEach.call($('gc-params').querySelectorAll('.gc-param'), function (el) {
			var n = el.dataset.n; if (document.activeElement === el.querySelector('.gc-num')) return;
			el.querySelector('input[type=range]').value = P[n]; el.querySelector('.gc-num').value = GC.fmtn(P[n]);
		});
	}
	function setParam(n, v, fromRow) {
		P[n] = v; var m = pmeta[n];
		if (m && m.row && !fromRow) { var r = rowById(m.row); if (r) { r.text = n + ' = ' + GC.fmtn(v); var inp = rowEl(r) && rowEl(r).querySelector('.gc-in'); if (inp && document.activeElement !== inp) { inp.value = r.text; autosize(inp); } r.desc.value = v; updateMsg(r); } }
		draw(); scheduleKeys(); saveSoon();
	}
	$('gc-params').addEventListener('input', function (e) {
		var el = e.target.closest('.gc-param'); if (!el) return; var n = el.dataset.n, m = pmeta[n];
		if (e.target.type === 'range') { var v = parseFloat(e.target.value); el.querySelector('.gc-num').value = GC.fmtn(v); setParam(n, v); }
		else if (e.target.classList.contains('gc-num')) { var v2 = parseFloat(e.target.value); if (isFinite(v2)) { if (v2 < m.min) m.min = v2; if (v2 > m.max) m.max = v2; var rg = el.querySelector('input[type=range]'); rg.min = m.min; rg.max = m.max; rg.value = v2; setParam(n, v2); } }
		else if (e.target.classList.contains('gc-min') || e.target.classList.contains('gc-max')) {
			var lo = parseFloat(el.querySelector('.gc-min').value), hi = parseFloat(el.querySelector('.gc-max').value);
			if (isFinite(lo) && isFinite(hi) && lo < hi) { m.min = lo; m.max = hi; var rg2 = el.querySelector('input[type=range]'); rg2.min = lo; rg2.max = hi; saveSoon(); }
		}
	});
	$('gc-params').addEventListener('click', function (e) {
		var b = e.target.closest('.gc-play'); if (!b) return; var n = b.closest('.gc-param').dataset.n; pmeta[n].play = !pmeta[n].play; b.setAttribute('aria-pressed', String(pmeta[n].play)); b.textContent = pmeta[n].play ? '❚❚' : '▶'; if (pmeta[n].play) startAnim();
	});
	var animOn = false, lastT = 0, dir = {};
	function startAnim() { if (animOn) return; animOn = true; lastT = performance.now(); requestAnimationFrame(tick); }
	function tick(now) {
		var dt = Math.min(0.1, (now - lastT) / 1000); lastT = now; var any = false;
		paramOrder.forEach(function (n) {
			var m = pmeta[n]; if (!m.play) return; any = true;
			var d = dir[n] || 1, span = m.max - m.min, v = P[n] + d * span / 6 * dt;
			if (v > m.max) { v = m.max; dir[n] = -1; } else if (v < m.min) { v = m.min; dir[n] = 1; }
			setParam(n, v);
		});
		refreshParamValues();
		if (any) requestAnimationFrame(tick); else animOn = false;
	}

	/* ---------- canvas / view ---------- */
	var canvas = $('gc-canvas'), stage = $('gc-stage'), ctx = canvas.getContext('2d'), W = 0, H = 0, dpr = 1;
	function resize() {
		var r = stage.getBoundingClientRect(); var nw = Math.max(50, Math.round(r.width)), nh = Math.max(50, Math.round(r.height));
		dpr = Math.min(3, window.devicePixelRatio || 1);
		if (nw === W && nh === H && canvas.width === Math.round(W * dpr)) return;
		if (W && !firstHome) { var f = nw / W; /* keep the scale when the stage is resized */ } W = nw; H = nh;
		canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); draw();
	}
	var firstHome = true;
	function homeView() { view = { cx: 0, cy: 0, sx: Math.max(10, Math.min(W || 800, 900) / 20), sy: 0 }; view.sy = view.sx; draw(); saveSoon(); scheduleKeys(); }
	function wx(px) { return view.cx + (px - W / 2) / view.sx; }
	function wy(py) { return view.cy - (py - H / 2) / view.sy; }
	function px(x) { return W / 2 + (x - view.cx) * view.sx; }
	function py(y) { return H / 2 - (y - view.cy) * view.sy; }
	function colors() {
		return isDark() ? { bg: '#161618', minor: '#242428', major: '#37373d', axis: '#9a9aa2', text: '#b8b8c0', ink: '#e8e8ea' } : { bg: '#ffffff', minor: '#eef0f3', major: '#d4d8de', axis: '#4a5160', text: '#4a5160', ink: '#1b1b1b' };
	}
	function inkColor(c) { return isDark() && (c === '#1b1b1b' || c === '#000000') ? '#e8e8ea' : c; }
	var needDraw = false, moving = false;
	function draw() { if (needDraw) return; needDraw = true; requestAnimationFrame(function () { needDraw = false; render(); }); }
	var markers = [], keyRows = [];

	function drawGrid(c) {
		ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
		var stepX = GC.niceStep(90 / view.sx), stepY = GC.niceStep(90 / view.sy);
		function lines(step, scale, horizontal) {
			var lo = horizontal ? wy(H) : wx(0), hi = horizontal ? wy(0) : wx(W);
			var minor = step / 5, i0 = Math.floor(lo / minor), i1 = Math.ceil(hi / minor);
			for (var pass = 0; pass < 2; pass++) {
				ctx.beginPath(); ctx.strokeStyle = pass ? c.major : c.minor; ctx.lineWidth = 1;
				for (var i = i0; i <= i1; i++) {
					var isMajor = i % 5 === 0; if ((pass === 1) !== isMajor) continue;
					if (!isMajor && minor * scale < 8) continue;
					var v = i * minor, p = Math.round(horizontal ? py(v) : px(v)) + 0.5;
					if (horizontal) { ctx.moveTo(0, p); ctx.lineTo(W, p); } else { ctx.moveTo(p, 0); ctx.lineTo(p, H); }
				}
				ctx.stroke();
			}
		}
		lines(stepX, view.sx, false); lines(stepY, view.sy, true);
		// axes
		var ax = px(0), ay = py(0);
		ctx.strokeStyle = c.axis; ctx.lineWidth = 1.5; ctx.beginPath();
		if (ay >= 0 && ay <= H) { ctx.moveTo(0, ay); ctx.lineTo(W, ay); }
		if (ax >= 0 && ax <= W) { ctx.moveTo(ax, 0); ctx.lineTo(ax, H); }
		ctx.stroke();
		// labels
		ctx.fillStyle = c.text; ctx.font = '12px system-ui, sans-serif';
		var lx = Math.min(Math.max(ax, 4), W - 4), ly = Math.min(Math.max(ay, 14), H - 6);
		ctx.textAlign = 'center'; ctx.textBaseline = 'top';
		var ty = Math.min(Math.max(ay + 4, 2), H - 16);
		for (var i = Math.ceil(wx(0) / stepX); i <= Math.floor(wx(W) / stepX); i++) { if (i === 0) continue; var xx = px(i * stepX); ctx.fillText(GC.fmtn(i * stepX), xx, ty); }
		ctx.textAlign = ax < 40 ? 'left' : 'right'; ctx.textBaseline = 'middle';
		var tx = ax < 40 ? Math.max(ax, 0) + 6 : Math.min(ax, W) - 6;
		for (var j = Math.ceil(wy(H) / stepY); j <= Math.floor(wy(0) / stepY); j++) { if (j === 0) continue; var yy = py(j * stepY); ctx.fillText(GC.fmtn(j * stepY), tx, yy); }
		if (ax >= 0 && ax <= W && ay >= 0 && ay <= H) { ctx.textAlign = 'right'; ctx.textBaseline = 'top'; ctx.fillText('0', ax - 5, ay + 4); }
	}

	// y = f(x) with refinement so steep parts stay connected but real jumps (floor, tan) are broken
	function plotFunc(d, color) {
		ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath();
		var pen = false, lastX = 0, lastY = NaN;
		function val(x) { var y = d.f(x); if (d.cond && !d.cond(x, y, 0)) return NaN; return y; }
		function pyOf(y) { var p = py(y); return isFinite(p) && Math.abs(p) < 1e5 ? p : NaN; }
		function seg(x0, p0, x1, p1, depth) {
			if (p0 !== p0 || p1 !== p1) return false;
			if (Math.abs(p1 - p0) <= 2) return true;
			if (depth === 0) return Math.abs(p1 - p0) < 12;
			var xm = (x0 + x1) / 2, pm = pyOf(val(xm));
			if (pm !== pm) return false;
			return seg(x0, p0, xm, pm, depth - 1) && seg(xm, pm, x1, p1, depth - 1);
		}
		var step = moving ? 2 : 1;
		for (var p = 0; p <= W + step; p += step) {
			var x = wx(p), pp = pyOf(val(x));
			if (pp !== pp) { pen = false; lastY = NaN; continue; }
			if (pen && lastY === lastY) {
				if (seg(lastX, lastY, x, pp, moving ? 0 : 7)) ctx.lineTo(p, pp);
				else { ctx.moveTo(p, pp); }
			} else ctx.moveTo(p, pp);
			pen = true; lastX = x; lastY = pp;
		}
		ctx.stroke();
	}
	function plotXFunc(d, color) {
		ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath(); var pen = false;
		for (var p = 0; p <= H + 1; p += 1) {
			var y = wy(p), x = d.f(y); if (d.cond && !d.cond(x, y, 0)) x = NaN;
			var q = px(x); if (!isFinite(q) || Math.abs(q) > 1e5) { pen = false; continue; }
			if (pen) ctx.lineTo(q, p); else ctx.moveTo(q, p); pen = true;
		}
		ctx.stroke();
	}
	function plotParam(d, color, polar) {
		var lo = d.tRange && d.tRange.lo != null ? d.tRange.lo : 0, hi = d.tRange && d.tRange.hi != null ? d.tRange.hi : 2 * Math.PI;
		if (!(hi > lo)) return;
		var n = moving ? 800 : 4000; ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.beginPath(); var pen = false;
		for (var i = 0; i <= n; i++) {
			var t = lo + (hi - lo) * i / n, X, Y;
			if (polar) { var r = d.r(t); X = r * Math.cos(t); Y = r * Math.sin(t); } else { X = d.fx(0, 0, t); Y = d.fy(0, 0, t); }
			if (d.cond && !d.cond(X, Y, t)) { pen = false; continue; }
			var a = px(X), b = py(Y); if (!isFinite(a) || !isFinite(b) || Math.abs(a) > 1e5 || Math.abs(b) > 1e5) { pen = false; continue; }
			if (pen) ctx.lineTo(a, b); else ctx.moveTo(a, b); pen = true;
		}
		ctx.stroke();
	}
	// implicit curve f(x,y)=0 by marching squares
	function gridValues(fn, cs, cond) {
		var nx = Math.ceil(W / cs) + 1, ny = Math.ceil(H / cs) + 1, v = new Float64Array(nx * ny);
		for (var j = 0; j < ny; j++) { var y = wy(j * cs); for (var i = 0; i < nx; i++) { var x = wx(i * cs), q = fn(x, y); if (cond && !cond(x, y, 0)) q = NaN; v[j * nx + i] = q; } }
		return { v: v, nx: nx, ny: ny };
	}
	function marching(fn, color, cond, dashed) {
		var cs = moving ? 6 : 3, g = gridValues(fn, cs, cond), v = g.v, nx = g.nx, ny = g.ny;
		ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.beginPath();
		if (dashed) ctx.setLineDash([7, 5]);
		function lerp(a, b, fa, fb) { var t = fa / (fa - fb); return a + (b - a) * t; }
		for (var j = 0; j < ny - 1; j++) for (var i = 0; i < nx - 1; i++) {
			var a = v[j * nx + i], b = v[j * nx + i + 1], c = v[(j + 1) * nx + i + 1], d = v[(j + 1) * nx + i];
			if (a !== a || b !== b || c !== c || d !== d) continue;
			var idx = (a > 0 ? 8 : 0) | (b > 0 ? 4 : 0) | (c > 0 ? 2 : 0) | (d > 0 ? 1 : 0);
			if (idx === 0 || idx === 15) continue;
			if (Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d)) > 1e8) continue;
			var x0 = i * cs, y0 = j * cs, x1 = x0 + cs, y1 = y0 + cs;
			var T = [lerp(x0, x1, a, b), y0], R = [x1, lerp(y0, y1, b, c)], B = [lerp(x0, x1, d, c), y1], L = [x0, lerp(y0, y1, a, d)];
			var segs;
			switch (idx) {
				case 1: case 14: segs = [[L, B]]; break; case 2: case 13: segs = [[B, R]]; break; case 3: case 12: segs = [[L, R]]; break;
				case 4: case 11: segs = [[T, R]]; break; case 6: case 9: segs = [[T, B]]; break; case 7: case 8: segs = [[L, T]]; break;
				case 5: segs = [[L, T], [B, R]]; break; case 10: segs = [[L, B], [T, R]]; break;
			}
			segs.forEach(function (s) { ctx.moveTo(s[0][0], s[0][1]); ctx.lineTo(s[1][0], s[1][1]); });
		}
		ctx.stroke(); ctx.setLineDash([]);
	}
	var shade = document.createElement('canvas');
	function plotIneq(d, color) {
		var cs = moving ? 4 : 2, w = Math.ceil(W / cs), h = Math.ceil(H / cs); shade.width = w; shade.height = h;
		var sctx = shade.getContext('2d'), img = sctx.createImageData(w, h), data = img.data, rgb = parseInt(color.slice(1), 16), R = rgb >> 16 & 255, G = rgb >> 8 & 255, B = rgb & 255;
		for (var j = 0; j < h; j++) { var y = wy(j * cs); for (var i = 0; i < w; i++) { var x = wx(i * cs); var ok = d.test(x, y); if (ok && d.cond && !d.cond(x, y, 0)) ok = false; if (ok) { var k = (j * w + i) * 4; data[k] = R; data[k + 1] = G; data[k + 2] = B; data[k + 3] = 70; } } }
		sctx.putImageData(img, 0, 0); ctx.imageSmoothingEnabled = false; ctx.drawImage(shade, 0, 0, w * cs, h * cs); ctx.imageSmoothingEnabled = true;
		d.bounds.forEach(function (b) { marching(b, color, null, d.strict); });
	}
	function plotPoint(d, color, c) {
		var a = px(d.x), b = py(d.y); if (!isFinite(a) || !isFinite(b)) return;
		ctx.fillStyle = color; ctx.beginPath(); ctx.arc(a, b, 5.5, 0, 6.2832); ctx.fill();
		ctx.fillStyle = c.ink; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('(' + GC.fmtn(d.x) + ', ' + GC.fmtn(d.y) + ')', a + 8, b - 6);
	}

	function render() {
		if (!W) return; var c = colors();
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
		drawGrid(c);
		rows.forEach(function (r) {
			if (!r.show || !r.desc) return; var d = r.desc, col = inkColor(r.color);
			try {
				if (d.kind === 'func') plotFunc(d, col); else if (d.kind === 'xfunc') plotXFunc(d, col);
				else if (d.kind === 'parametric') plotParam(d, col, false); else if (d.kind === 'polar') plotParam(d, col, true);
				else if (d.kind === 'implicit') marching(d.f, col, d.cond, false); else if (d.kind === 'ineq') plotIneq(d, col); else if (d.kind === 'point') plotPoint(d, col, c);
			} catch (e) { /* a row that throws at draw time just does not draw */ }
		});
		// key point markers + trace dot
		markers.forEach(function (m) { var a = px(m.x), b = py(m.y); if (a < -10 || a > W + 10 || b < -10 || b > H + 10) return; ctx.beginPath(); ctx.arc(a, b, 5, 0, 6.2832); ctx.fillStyle = c.bg; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = inkColor(m.color); ctx.stroke(); });
		if (trace) { ctx.beginPath(); ctx.arc(px(trace.x), py(trace.y), 4.5, 0, 6.2832); ctx.fillStyle = inkColor(trace.color); ctx.fill(); }
	}

	/* ---------- key points ---------- */
	var keyTimer;
	function scheduleKeys() { clearTimeout(keyTimer); keyTimer = setTimeout(computeKeys, 140); }
	function computeKeys() {
		markers = []; var r = rowById(activeId), card = $('gc-kp');
		if (!r || !r.desc || r.desc.kind !== 'func' || !r.show || r.err) { card.hidden = true; draw(); return; }
		var others = rows.filter(function (o) { return o !== r && o.show && o.desc && o.desc.kind === 'func' && !o.err; }).map(function (o) { return { f: o.desc.f, label: 'row ' + (rows.indexOf(o) + 1) }; });
		var f = r.desc.f; if (r.desc.cond) { var raw = f, cd = r.desc.cond; f = function (x) { var y = raw(x); return cd(x, y, 0) ? y : NaN; }; others = others.map(function (o) { return o; }); }
		var pts = [];
		try { pts = GC.keyPoints(f, others, wx(0), wx(W), Math.min(2400, W * 2)); } catch (e) {}
		pts = pts.slice(0, 40); pts.forEach(function (p) { p.color = r.color; markers.push(p); });
		var tb = $('gc-kp-table').querySelector('tbody');
		tb.innerHTML = pts.length ? pts.map(function (p) { return '<tr><td>' + p.type + '</td><td>' + GC.fmtn(p.x) + '</td><td>' + GC.fmtn(p.y) + '</td></tr>'; }).join('') : '<tr><td colspan="3" style="text-align:left;">No zeros, extremes or intersections in view.</td></tr>';
		$('gc-kp-name').textContent = r.text.trim().slice(0, 40); card.hidden = false; draw();
	}

	/* ---------- interaction ---------- */
	var trace = null, pointers = {}, drag = null, pinch = null, movingTimer;
	function setMoving() { moving = true; clearTimeout(movingTimer); movingTimer = setTimeout(function () { moving = false; draw(); scheduleKeys(); saveSoon(); }, 140); }
	function localPos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
	function zoomAt(f, p, ax, ay) {
		var X = wx(p.x), Y = wy(p.y);
		if (ax !== false) { view.sx = Math.min(1e7, Math.max(1e-5, view.sx * f)); view.cx = X - (p.x - W / 2) / view.sx; }
		if (ay !== false) { view.sy = Math.min(1e7, Math.max(1e-5, view.sy * f)); view.cy = Y + (p.y - H / 2) / view.sy; }
		setMoving(); draw();
	}
	canvas.addEventListener('pointerdown', function (e) {
		canvas.setPointerCapture(e.pointerId); var p = localPos(e); pointers[e.pointerId] = p; canvas.focus({ preventScroll: true });
		var ids = Object.keys(pointers);
		if (ids.length === 1) drag = { x: p.x, y: p.y, cx: view.cx, cy: view.cy };
		else if (ids.length === 2) { var a = pointers[ids[0]], b = pointers[ids[1]]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), sx: view.sx, sy: view.sy }; drag = null; }
	});
	canvas.addEventListener('pointermove', function (e) {
		var p = localPos(e);
		if (pointers[e.pointerId]) {
			pointers[e.pointerId] = p; var ids = Object.keys(pointers);
			if (ids.length === 2 && pinch) {
				var a = pointers[ids[0]], b = pointers[ids[1]], mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, f = Math.hypot(a.x - b.x, a.y - b.y) / pinch.d;
				var X = wx(mid.x), Y = wy(mid.y); view.sx = pinch.sx * f; view.sy = pinch.sy * f; view.cx = X - (mid.x - W / 2) / view.sx; view.cy = Y + (mid.y - H / 2) / view.sy; setMoving(); draw();
			} else if (drag) { view.cx = drag.cx - (p.x - drag.x) / view.sx; view.cy = drag.cy + (p.y - drag.y) / view.sy; setMoving(); draw(); }
			return;
		}
		hover(p);
	});
	function endPointer(e) { delete pointers[e.pointerId]; var ids = Object.keys(pointers); pinch = null; if (ids.length === 1) { var q = pointers[ids[0]]; drag = { x: q.x, y: q.y, cx: view.cx, cy: view.cy }; } else drag = null; }
	canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
	canvas.addEventListener('pointerleave', function () { trace = null; $('gc-tip').hidden = true; $('gc-readout').textContent = ''; draw(); });
	canvas.addEventListener('wheel', function (e) {
		e.preventDefault(); var f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0016)); zoomAt(f, localPos(e), e.altKey ? false : true, e.shiftKey ? false : true);
	}, { passive: false });
	canvas.addEventListener('dblclick', function (e) { zoomAt(1.6, localPos(e)); });
	canvas.addEventListener('keydown', function (e) {
		var k = e.key, step = 0.1;
		if (k === 'ArrowLeft') view.cx -= W * step / view.sx; else if (k === 'ArrowRight') view.cx += W * step / view.sx;
		else if (k === 'ArrowUp') view.cy += H * step / view.sy; else if (k === 'ArrowDown') view.cy -= H * step / view.sy;
		else if (k === '+' || k === '=') { zoomAt(1.25, { x: W / 2, y: H / 2 }); return; } else if (k === '-' || k === '_') { zoomAt(0.8, { x: W / 2, y: H / 2 }); return; }
		else if (k === '0') { homeView(); return; } else return;
		e.preventDefault(); setMoving(); draw();
	});
	function hover(p) {
		var x = wx(p.x), y = wy(p.y), txt = '(' + GC.fmtn(x) + ', ' + GC.fmtn(y) + ')';
		var r = rowById(activeId); trace = null;
		if (r && r.show && r.desc && r.desc.kind === 'func' && !r.err) { var fy = r.desc.f(x); if (r.desc.cond && !r.desc.cond(x, fy, 0)) fy = NaN; if (isFinite(fy)) { trace = { x: x, y: fy, color: r.color }; txt += '   f(x) = ' + GC.fmtn(fy); } }
		$('gc-readout').textContent = txt;
		var best = null, bd = 12;
		markers.forEach(function (m) { var d = Math.hypot(px(m.x) - p.x, py(m.y) - p.y); if (d < bd) { bd = d; best = m; } });
		var tip = $('gc-tip');
		if (best) { tip.hidden = false; tip.style.left = px(best.x) + 'px'; tip.style.top = py(best.y) + 'px'; tip.textContent = best.type + ': (' + GC.fmtn(best.x) + ', ' + GC.fmtn(best.y) + ')'; trace = null; } else tip.hidden = true;
		draw();
	}

	/* ---------- toolbar ---------- */
	$('gc-zin').addEventListener('click', function () { zoomAt(1.4, { x: W / 2, y: H / 2 }); });
	$('gc-zout').addEventListener('click', function () { zoomAt(1 / 1.4, { x: W / 2, y: H / 2 }); });
	$('gc-home').addEventListener('click', homeView);
	$('gc-sq').addEventListener('click', function () { view.sy = view.sx; draw(); saveSoon(); scheduleKeys(); });
	function setDeg() { M.deg = deg; $('gc-deg').textContent = deg ? 'Deg' : 'Rad'; $('gc-deg').setAttribute('aria-pressed', String(deg)); }
	$('gc-deg').addEventListener('click', function () { deg = !deg; setDeg(); draw(); scheduleKeys(); saveSoon(); });
	$('gc-png').addEventListener('click', function () {
		canvas.toBlob(function (b) { if (!b) return; var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mes-graph.png'; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); });
	});
	$('gc-link').addEventListener('click', function () { copy(location.origin + location.pathname + '?s=' + encodeURIComponent(encode(snapshot())), 'Link copied'); });
	function paintTheatre() { $('gc-theatre').setAttribute('aria-pressed', String(document.documentElement.classList.contains('page-theatre'))); }
	$('gc-theatre').addEventListener('click', function () {
		var on = document.documentElement.classList.toggle('page-theatre');
		try { localStorage.setItem('pageMode', on ? 'theatre' : 'std'); localStorage.setItem('pageWide', on ? '1' : '0'); } catch (e) {}
		paintTheatre(); setTimeout(resize, 60);
	});
	paintTheatre();
	/* Fill window: cover the whole browser window (not the Fullscreen API), Esc leaves */
	function setWin(on) {
		document.body.classList.toggle('gc-win', on); $('gc-win').setAttribute('aria-pressed', String(on));
		$('gc-win').textContent = on ? 'Exit window' : 'Fill window'; if (on) window.scrollTo(0, 0);
		setTimeout(function () { setTimeout(resize, 60); }, 40);
	}
	$('gc-win').addEventListener('click', function () { setWin(!document.body.classList.contains('gc-win')); });
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.body.classList.contains('gc-win') && !document.fullscreenElement) setWin(false); });
	$('gc-full').addEventListener('click', function () { if (document.fullscreenElement) document.exitFullscreen(); else if (stage.requestFullscreen) stage.requestFullscreen(); });
	document.addEventListener('fullscreenchange', function () { setTimeout(resize, 50); });
	if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);
	new MutationObserver(function () { draw(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

	/* ---------- change pipeline ---------- */
	function changed(structure) {
		compileAll(); rows.forEach(updateMsg); renderParams(false); draw(); scheduleKeys(); saveSoon();
	}

	/* ---------- start-up ---------- */
	var q = new URLSearchParams(location.search), s = null;
	if (q.get('s')) s = decode(q.get('s'));
	else if (q.getAll('f').length) s = { r: q.getAll('f').map(function (t) { return [t.slice(0, 300)]; }) };
	else { try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; } }
	if (s && s.r && s.r.length) restore(s); else DEFAULT_ROWS.forEach(function (t) { addRow(t); });
	activeId = rows[0].id; setDeg();
	resize(); if (!(s && s.v)) homeView();
	firstHome = false; renderRows(); compileAll(); rows.forEach(updateMsg); renderParams(true); draw(); scheduleKeys();
})();
