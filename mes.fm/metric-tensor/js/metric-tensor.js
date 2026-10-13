/* Metric Tensor Explorer: curvature calculator (SymPy in a worker via MESCAS) + geodesic shooter drawn on the surface. */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	var root = $('mt'); if (!root) return;
	var KEY = 'mes-metric-tensor:v1';
	var CU = window.CASUI;

	/* ---------------- presets: Compute tab ---------------- */
	var Z = '0';
	function diag() { return Array.prototype.slice.call(arguments); }
	var PRE = [
		{ id: 'schw', n: 'Schwarzschild black hole', co: 't, r, theta, phi', pa: 'M', po: 'r, M', g: [['-(1-2*M/r)', Z, Z, Z], [Z, '1/(1-2*M/r)', Z, Z], [Z, Z, 'r^2', Z], [Z, Z, Z, 'r^2*sin(theta)^2']],
			note: 'Empty space around a non-spinning mass M (units G = c = 1). Ricci = 0 (vacuum) but Riemann is not: tidal forces. Kretschmann = 48M²/r⁶.' },
		{ id: 'mink', n: 'Minkowski (flat space-time, Cartesian)', co: 't, x, y, z', pa: '', po: '', g: [['-1', Z, Z, Z], [Z, '1', Z, Z], [Z, Z, '1', Z], [Z, Z, Z, '1']], note: 'Special relativity. Every curvature component is zero.' },
		{ id: 'minks', n: 'Minkowski in spherical coordinates', co: 't, r, theta, phi', pa: '', po: 'r', g: [['-1', Z, Z, Z], [Z, '1', Z, Z], [Z, Z, 'r^2', Z], [Z, Z, Z, 'r^2*sin(theta)^2']], note: 'Flat space with a curvy grid: Christoffel symbols are not zero, but Riemann is. Coordinates alone do not make curvature.' },
		{ id: 'rindler', n: 'Rindler (accelerating observer)', co: 't, x, y, z', pa: 'a', po: 'x, a', g: [['-(a*x)^2', Z, Z, Z], [Z, '1', Z, Z], [Z, Z, '1', Z], [Z, Z, Z, '1']], note: 'Flat space seen by a uniformly accelerating observer. Looks like it has a horizon at x = 0, but the curvature is zero.' },
		{ id: 'ef', n: 'Schwarzschild, ingoing Eddington–Finkelstein', co: 'v, r, theta, phi', pa: 'M', po: 'r, M', g: [['-(1-2*M/r)', '1', Z, Z], ['1', Z, Z, Z], [Z, Z, 'r^2', Z], [Z, Z, Z, 'r^2*sin(theta)^2']], note: 'The same black hole in coordinates that pass smoothly through the horizon. The Kretschmann scalar is identical: the horizon is not a real singularity.' },
		{ id: 'rn', n: 'Reissner–Nordström (charged black hole)', co: 't, r, theta, phi', pa: 'M, Q', po: 'r, M, Q', g: [['-(1-2*M/r+Q^2/r^2)', Z, Z, Z], [Z, '1/(1-2*M/r+Q^2/r^2)', Z, Z], [Z, Z, 'r^2', Z], [Z, Z, Z, 'r^2*sin(theta)^2']], note: 'A charged mass: the Ricci tensor is non-zero because the electric field carries energy.' },
		{ id: 'sds', n: 'Schwarzschild–de Sitter', co: 't, r, theta, phi', pa: 'M, L', po: 'r, M, L', g: [['-(1-2*M/r-L*r^2/3)', Z, Z, Z], [Z, '1/(1-2*M/r-L*r^2/3)', Z, Z], [Z, Z, 'r^2', Z], [Z, Z, Z, 'r^2*sin(theta)^2']], note: 'A black hole in a universe with a positive cosmological constant Λ (written L). Check Einstein = −Λ g.' },
		{ id: 'ds', n: 'de Sitter (static patch)', co: 't, r, theta, phi', pa: 'H', po: 'r, H', g: [['-(1-H^2*r^2)', Z, Z, Z], [Z, '1/(1-H^2*r^2)', Z, Z], [Z, Z, 'r^2', Z], [Z, Z, Z, 'r^2*sin(theta)^2']], note: 'A universe with only dark energy. Constant curvature: the Ricci scalar is 12H².' },
		{ id: 'flrwm', n: 'FLRW, flat, matter-dominated', co: 't, x, y, z', pa: '', po: 't', g: [['-1', Z, Z, Z], [Z, 't^(4/3)', Z, Z], [Z, Z, 't^(4/3)', Z], [Z, Z, Z, 't^(4/3)']], note: 'An expanding universe filled with dust: scale factor a = t^(2/3). Compare the Einstein tensor with the density: G₀₀ = 3H² = 4/(3t²).' },
		{ id: 'flrwds', n: 'FLRW, flat, exponential expansion', co: 't, x, y, z', pa: 'H', po: 'H', g: [['-1', Z, Z, Z], [Z, 'exp(2*H*t)', Z, Z], [Z, Z, 'exp(2*H*t)', Z], [Z, Z, Z, 'exp(2*H*t)']], note: 'Inflation / dark-energy dominated expansion, a = e^(Ht): the same space-time as de Sitter in other coordinates.' },
		{ id: 'ellis', n: 'Ellis wormhole', co: 't, l, theta, phi', pa: 'b', po: 'b', g: [['-1', Z, Z, Z], [Z, '1', Z, Z], [Z, Z, 'l^2+b^2', Z], [Z, Z, Z, '(l^2+b^2)*sin(theta)^2']], note: 'A throat of radius b joining two flat regions. Needs exotic (negative-energy) matter: check the Einstein tensor.' },
		{ id: 'sph2', n: 'Sphere (2D surface)', co: 'theta, phi', pa: 'R', po: 'R', g: [['R^2', Z], [Z, 'R^2*sin(theta)^2']], note: 'Gaussian curvature 1/R²: the Ricci scalar is 2/R².' },
		{ id: 'polar', n: 'Plane in polar coordinates', co: 'r, theta', pa: '', po: 'r', g: [['1', Z], [Z, 'r^2']], note: 'Flat, with non-zero Christoffel symbols.' },
		{ id: 'hyp', n: 'Hyperbolic plane (half-plane)', co: 'x, y', pa: '', po: 'y', g: [['1/y^2', Z], [Z, '1/y^2']], note: 'Constant negative curvature −1: Ricci scalar −2.' },
		{ id: 'torus', n: 'Torus (2D surface)', co: 'theta, phi', pa: 'R, r', po: 'R, r', g: [['r^2', Z], [Z, '(R+r*cos(theta))^2']], note: 'Curvature is positive outside, negative inside the hole, and averages to zero.' },
		{ id: 's3', n: '3-sphere (hypersphere)', co: 'chi, theta, phi', pa: '', po: '', g: [['1', Z, Z], [Z, 'sin(chi)^2', Z], [Z, Z, 'sin(chi)^2*sin(theta)^2']], note: 'The space of a closed universe: constant positive curvature, Ricci scalar 6.' },
		{ id: 'custom', n: 'My own metric…', co: 'x, y', pa: '', po: '', g: [['1', Z], [Z, '1']], note: 'Edit the coordinates and the matrix freely. Use ^ for powers and normal function names.' }
	];

	/* ---------------- state ---------------- */
	var S = { pre: 'schw', co: '', g: null, pa: '', po: '', want: null, gpre: 'sphere', gs: null };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) { S.pre = sv.pre || S.pre; S.gpre = sv.gpre || S.gpre; } } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify({ pre: S.pre, gpre: S.gpre })); } catch (e) {} }
	function preById(id) { return PRE.filter(function (p) { return p.id === id; })[0] || PRE[0]; }

	/* ---------------- tabs ---------------- */
	var tabs = root.querySelectorAll('.mt-tabs [role=tab]');
	function showTab(t) {
		for (var i = 0; i < tabs.length; i++) tabs[i].setAttribute('aria-selected', tabs[i].dataset.tab === t ? 'true' : 'false');
		var ps = root.querySelectorAll('[data-panel]');
		for (var j = 0; j < ps.length; j++) ps[j].hidden = ps[j].dataset.panel !== t;
		if (t === 'geo') { resize(); draw(); if (!geoRan) runGeo(); }
	}
	for (var ti = 0; ti < tabs.length; ti++) tabs[ti].addEventListener('click', function () { showTab(this.dataset.tab); });

	/* ---------------- Compute tab ---------------- */
	var elPre = $('mt-pre'), elCo = $('mt-co'), elGrid = $('mt-grid'), elPa = $('mt-pa'), elPo = $('mt-po'), elOut = $('mt-out'), elSt = $('mt-status');
	PRE.forEach(function (p) { var o = document.createElement('option'); o.value = p.id; o.textContent = p.n; elPre.appendChild(o); });
	function coords() { return elCo.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean); }
	function buildGrid(g) {
		var n = coords().length; if (n < 2) n = 2; if (n > 4) n = 4;
		elGrid.style.gridTemplateColumns = 'repeat(' + n + ', minmax(0, 1fr))';
		elGrid.innerHTML = '';
		for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
			var inp = document.createElement('input'); inp.type = 'text'; inp.autocomplete = 'off'; inp.spellcheck = false;
			inp.value = g && g[i] && g[i][j] != null ? g[i][j] : (i === j ? '1' : '0');
			inp.dataset.i = i; inp.dataset.j = j; inp.setAttribute('aria-label', 'g ' + (i + 1) + ',' + (j + 1));
			inp.className = inp.value === '0' ? 'is-zero' : '';
			inp.addEventListener('input', onCell);
			elGrid.appendChild(inp);
		}
	}
	function onCell() {
		var i = +this.dataset.i, j = +this.dataset.j; this.className = this.value.trim() === '0' || !this.value.trim() ? 'is-zero' : '';
		if (i !== j) { var m = elGrid.querySelector('[data-i="' + j + '"][data-j="' + i + '"]'); if (m) { m.value = this.value; m.className = this.className; } }
		markCustom();
	}
	function readGrid() {
		var n = Math.round(Math.sqrt(elGrid.children.length)), g = [];
		for (var i = 0; i < n; i++) { g.push([]); for (var j = 0; j < n; j++) g[i].push(elGrid.children[i * n + j].value.trim() || '0'); }
		return g;
	}
	function markCustom() { if (elPre.value !== 'custom') { elPre.value = 'custom'; $('mt-pre-note').textContent = preById('custom').note; } }
	function loadPre(id, keep) {
		var p = preById(id); S.pre = id; elPre.value = id;
		if (!keep) { elCo.value = p.co; elPa.value = p.pa; elPo.value = p.po; buildGrid(p.g); }
		$('mt-pre-note').textContent = p.note; save();
	}
	elPre.addEventListener('change', function () { loadPre(elPre.value); });
	elCo.addEventListener('change', function () { buildGrid(readGrid()); markCustom(); });
	[elPa, elPo].forEach(function (e) { e.addEventListener('input', markCustom); });

	var titles = { christoffel: 'Christoffel symbols', geodesic: 'Geodesic equations', riemann: 'Riemann tensor', ricci: 'Ricci tensor and scalar', einstein: 'Einstein tensor', kretschmann: 'Kretschmann scalar' };
	var sections = [], running = false;
	function renderSections(secs, finalRun) {
		var open = {}; Array.prototype.forEach.call(elOut.querySelectorAll('details'), function (d) { open[d.dataset.id] = d.open; });
		elOut.innerHTML = '';
		secs.forEach(function (s, idx) {
			var d = document.createElement('details'); d.className = 'mt-sec'; d.dataset.id = s.id;
			d.open = s.id in open ? open[s.id] : (idx < 2 || s.id === 'basic');
			var sum = document.createElement('summary'); sum.innerHTML = CU.esc(s.title) + '<small>' + (s.items ? s.items.length + ' item' + (s.items.length === 1 ? '' : 's') : '') + '</small>'; d.appendChild(sum);
			var b = document.createElement('div'); b.className = 'mt-body';
			if (s.note) { var nn = document.createElement('p'); nn.className = 'mt-note'; nn.textContent = s.note; b.appendChild(nn); }
			var box = document.createElement('div'); box.className = 'mt-items';
			(s.items || []).forEach(function (it) {
				var r = document.createElement('div'); r.className = 'mt-item';
				r.innerHTML = '<span class="mt-l">' + CU.mi(it.label + ' =') + '</span><span class="mt-v">' + CU.mi(it.value) + '</span>';
				box.appendChild(r);
			});
			b.appendChild(box);
			var cp = document.createElement('button'); cp.type = 'button'; cp.className = 'tu-btn tu-btn--ghost mt-copy'; cp.textContent = 'Copy LaTeX';
			cp.addEventListener('click', function () {
				var t = (s.items || []).map(function (it) { return it.label + ' = ' + it.value; }).join('\n');
				if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { cp.textContent = 'Copied'; setTimeout(function () { cp.textContent = 'Copy LaTeX'; }, 1200); });
			});
			b.appendChild(cp); d.appendChild(b); elOut.appendChild(d);
		});
		CU.typeset(elOut);
	}
	function status(t, err) { elSt.textContent = t || ''; elSt.className = 'mt-status' + (err ? ' err' : ''); }
	function wants() { return Array.prototype.filter.call($('mt-want').querySelectorAll('input'), function (c) { return c.checked; }).map(function (c) { return c.value; }); }
	function list(s) { return s.split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
	function setRun(on) {
		running = on; $('mt-run').disabled = on; $('mt-cancel').hidden = !on; $('mt-bar').hidden = !on;
	}
	var tick = null;
	function runCompute() {
		if (running) return;
		var co = coords();
		if (co.length < 2 || co.length > 4) { status('Use 2 to 4 coordinates.', true); return; }
		var req = { op: 'metric', coords: co, g: readGrid(), params: list(elPa.value), positive: list(elPo.value), want: wants() };
		setRun(true); status('Starting the algebra engine…'); $('mt-bari').style.width = '3%';
		var t0 = Date.now(); clearInterval(tick);
		tick = setInterval(function () { var w = Math.min(95, 3 + (Date.now() - t0) / 900); $('mt-bari').style.width = w + '%'; }, 300);
		window.MESCAS.call(req, { timeout: 120000, onPartial: function (p) { if (p && p.sections) { renderSections(p.sections); status('Working… (' + p.sections.length + ' section' + (p.sections.length === 1 ? '' : 's') + ' so far)'); } } }).then(function (r) {
			clearInterval(tick); setRun(false);
			if (!r || r.ok === false) { status((r && r.error) || 'Could not compute that.', true); return; }
			renderSections(r.sections, true); status('Done in ' + (r.ms != null ? (r.ms / 1000).toFixed(1) + ' s' : 'a moment') + '.');
		}, function (e) { clearInterval(tick); setRun(false); status(e && e.message ? e.message : String(e), true); });
	}
	$('mt-run').addEventListener('click', runCompute);
	$('mt-cancel').addEventListener('click', function () { window.MESCAS.cancel(); });
	window.MESCAS && window.MESCAS.onStatus(function (st) { if (running && st && st.stage && st.state === 'loading') status(st.stage + (st.pct ? ' ' + Math.round(st.pct) + '%' : '')); });

	function linkFor(extra) { return location.origin + location.pathname + '?' + extra; }
	function copy(t, btn) { if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { var o = btn.textContent; btn.textContent = 'Link copied'; setTimeout(function () { btn.textContent = o; }, 1300); }); }
	$('mt-link').addEventListener('click', function () {
		var q = 'm=' + encodeURIComponent(S.pre === 'custom' ? '' : S.pre);
		if (S.pre === 'custom' || true) q += '&c=' + encodeURIComponent(elCo.value) + '&g=' + encodeURIComponent(JSON.stringify(readGrid())) + '&pa=' + encodeURIComponent(elPa.value) + '&po=' + encodeURIComponent(elPo.value);
		copy(linkFor(q + '&run=1'), this);
	});

	/* ---------------- Geodesics tab ---------------- */
	var pi = Math.PI;
	var SURF = [
		{ id: 'plane', n: 'Flat plane', co: ['x', 'y'], g: [['1', '0'], ['0', '1']], ds: 'dx² + dy²', rng: [[-5, 5], [-5, 5]], b: [[-6, -6], [6, 6]], s: [0, 0], emb: function (a, b) { return [a, b, 0]; }, view: '2d', ext: 6, L: 5, note: 'Geodesics in a flat plane are straight lines.' },
		{ id: 'polar', n: 'Plane in polar coordinates', co: ['r', 'theta'], g: [['1', '0'], ['0', 'r^2']], ds: 'dr² + r²dθ²', rng: [[0.3, 5], [-pi, pi]], b: [[0.02, -400], [8, 400]], pos: ['r'], s: [1.5, 0], emb: function (a, b) { return [a * Math.cos(b), a * Math.sin(b), 0]; }, view: '2d', ext: 6, L: 6, note: 'Still the flat plane, so the paths are straight lines even though they look odd in (r, θ). This is what Christoffel symbols correct for.' },
		{ id: 'sphere', n: 'Sphere', co: ['theta', 'phi'], g: [['1', '0'], ['0', 'sin(theta)^2']], ds: 'dθ² + sin²θ dφ²', rng: [[0.35, pi - 0.35], [-pi, pi]], b: [[0.015, -400], [pi - 0.015, 400]], s: [1.2, 0], emb: function (t, p) { return [Math.sin(t) * Math.cos(p), Math.cos(t), Math.sin(t) * Math.sin(p)]; }, view: '3d', L: 6.5, note: 'Geodesics are great circles; they all meet again on the far side. Those that pass exactly through a pole are stopped there (the chart breaks down). Drag to rotate.' },
		{ id: 'torus', n: 'Torus (donut)', co: ['theta', 'phi'], g: [['1', '0'], ['0', '(2+cos(theta))^2']], ds: 'dθ² + (2 + cos θ)² dφ²', rng: [[-pi, pi], [-pi, pi]], b: [[-400, -400], [400, 400]], s: [0.6, 0], emb: function (t, p) { var R = 2 + Math.cos(t); return [R * Math.cos(p), Math.sin(t), R * Math.sin(p)]; }, view: '3d', L: 30, note: 'Some geodesics close up, others wind round forever and fill the surface. Drag to rotate. R = 2, r = 1.' },
		{ id: 'cyl', n: 'Cylinder', co: ['z', 'phi'], g: [['1', '0'], ['0', '1']], ds: 'dz² + dφ²', rng: [[-2.5, 2.5], [-pi, pi]], b: [[-6, -400], [6, 400]], s: [0, 0], emb: function (z, p) { return [Math.cos(p), z * 0.8, Math.sin(p)]; }, view: '3d', L: 9, note: 'Flat (unroll it into a sheet), so geodesics are helices, circles and straight lines.' },
		{ id: 'cone', n: 'Cone', co: ['r', 'phi'], g: [['1', '0'], ['0', 'r^2/4']], ds: 'dr² + (r²/4)dφ²', rng: [[0.4, 5], [-pi, pi]], b: [[0.03, -400], [9, 400]], pos: ['r'], s: [3, 0], emb: function (r, p) { var s = 0.5, c = Math.sqrt(0.75); return [r * s * Math.cos(p), -r * c * 0.7 + 1.5, r * s * Math.sin(p)]; }, view: '3d', L: 8, note: 'Also flat away from the tip. Geodesics wrap round and cross themselves.' },
		{ id: 'hyp', n: 'Hyperbolic plane (half-plane model)', co: ['x', 'y'], g: [['1/y^2', '0'], ['0', '1/y^2']], ds: '(dx² + dy²)/y²', rng: [[-4, 4], [0.1, 4]], b: [[-60, 0.02], [60, 40]], pos: ['y'], s: [0, 1], emb: function (a, b) { return [a, b, 0]; }, view: '2d', ext: 4.4, off: [0, 2], L: 7, note: 'Geodesics are vertical lines and semicircles centred on the axis y = 0. Parallel lines drift apart, and triangles have angles that add up to less than 180°.' },
		{ id: 'disk', n: 'Hyperbolic plane (Poincaré disk)', co: ['x', 'y'], g: [['4/(1-x^2-y^2)^2', '0'], ['0', '4/(1-x^2-y^2)^2']], ds: '4(dx² + dy²)/(1 − x² − y²)²', rng: [[-0.95, 0.95], [-0.95, 0.95]], b: [[-0.995, -0.995], [0.995, 0.995]], s: [0, 0], emb: function (a, b) { return [a, b, 0]; }, view: '2d', ext: 1.05, disk: true, L: 8, note: 'The whole infinite hyperbolic plane squeezed into a disk. Geodesics are circle arcs meeting the edge at right angles; the edge is infinitely far away.' },
		{ id: 'flamm', n: 'Schwarzschild space slice (Flamm paraboloid)', co: ['r', 'phi'], g: [['1/(1-2/r)', '0'], ['0', 'r^2']], ds: 'dr²/(1 − 2M/r) + r²dφ² (M = 1)', rng: [[2.1, 10], [-pi, pi]], b: [[2.005, -400], [14, 400]], pos: ['r'], s: [6, 0], emb: function (r, p) { var z = 2 * Math.sqrt(2 * Math.max(0, r - 2)); return [r * Math.cos(p) * 0.5, 2.4 - z * 0.5, r * Math.sin(p) * 0.5]; }, view: '3d', L: 14, note: 'The curved space around a black hole (a plane slice, M = 1, drawn at half scale): the funnel of Flamm’s paraboloid. Paths bend towards the throat at r = 2M. This is space only, not light rays in space-time (see the Black Hole Simulator).' }
	];
	function surf(id) { return SURF.filter(function (s) { return s.id === id; })[0] || SURF[0]; }
	var elG = $('mt-gpre'); SURF.forEach(function (s) { var o = document.createElement('option'); o.value = s.id; o.textContent = s.n; elG.appendChild(o); });

	var cv = $('mt-gc'), cx = cv.getContext('2d'), stage = $('mt-stage');
	var W = 600, H = 400, dpr = 1;
	var cam = { yaw: 0.6, pitch: 0.35, zoom: 1 };
	var paths = null, geoRan = false, curS = null, startPt = [0, 0], gparam = { n: 14, ang: 0, len: 6, fan: true };
	function resize() {
		stage.parentNode.setAttribute('data-mes-free', '1');
		var r = stage.getBoundingClientRect(); if (!r.width) return;
		dpr = Math.min(2, window.devicePixelRatio || 1);
		W = Math.round(r.width); H = Math.round(r.height);
		cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
	}
	if (window.ResizeObserver) new ResizeObserver(function () { resize(); draw(); }).observe(stage);
	window.addEventListener('resize', function () { resize(); draw(); });

	function proj(p) { /* p = 3D point, returns [sx, sy, depth] */
		var s = curS, sc = Math.min(W, H) * 0.34 * cam.zoom;
		if (s.view === '2d') {
			var sc2 = Math.min(W, H) * 0.46 / s.ext * cam.zoom, o = s.off || [0, 0];
			return [W / 2 + (p[0] - o[0]) * sc2, H / 2 - (p[1] - o[1]) * sc2, 0];
		}
		var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
		var x = p[0] * cy - p[2] * sy, z0 = p[0] * sy + p[2] * cy, y = p[1] * cp - z0 * sp, z = p[1] * sp + z0 * cp;
		return [W / 2 + x * sc, H / 2 - y * sc, z];
	}
	function surfaceNormalFacing(a, b) { /* true if the surface point faces the camera (approximate, by depth of normal for closed shapes) */
		return true;
	}
	function draw() {
		if (!curS || !W) return;
		var s = curS, dark = true;
		cx.setTransform(dpr, 0, 0, dpr, 0, 0);
		cx.fillStyle = dark ? '#10131a' : '#f7f8fb'; cx.fillRect(0, 0, W, H);
		var col = dark ? { grid: 'rgba(140,160,200,0.28)', ln: ['#ffb454', '#7dd3fc', '#f9a8d4', '#86efac'], st: '#ffffff', fill: 'rgba(120,140,190,0.10)' } : { grid: 'rgba(60,80,130,0.28)', ln: ['#c2410c', '#1d4ed8', '#be185d', '#15803d'], st: '#111111', fill: 'rgba(80,100,160,0.07)' };
		var a0 = s.rng[0][0], a1 = s.rng[0][1], b0 = s.rng[1][0], b1 = s.rng[1][1];
		/* wireframe of the chart */
		cx.lineWidth = 1; cx.strokeStyle = col.grid;
		var NA = s.view === '3d' ? 18 : 10, NB = s.view === '3d' ? 28 : 10, SEG = 60;
		var full = s.id === 'sphere' || s.id === 'torus' || s.id === 'cyl' || s.id === 'cone' || s.id === 'flamm';
		var grid = [];
		for (var i = 0; i <= NA; i++) { var a = a0 + (a1 - a0) * i / NA; var ln = []; for (var k = 0; k <= SEG; k++) ln.push(s.emb(a, b0 + (b1 - b0) * k / SEG)); grid.push(ln); }
		for (var j = 0; j <= NB; j++) { var b = b0 + (b1 - b0) * j / NB; var ln2 = []; for (var k2 = 0; k2 <= SEG; k2++) ln2.push(s.emb(a0 + (a1 - a0) * k2 / SEG, b)); grid.push(ln2); }
		if (s.disk) { cx.beginPath(); var c0 = proj([0, 0, 0]), c1 = proj([1, 0, 0]); cx.arc(c0[0], c0[1], c1[0] - c0[0], 0, 2 * pi); cx.fillStyle = col.fill; cx.fill(); cx.strokeStyle = col.grid; cx.stroke(); }
		grid.forEach(function (ln) {
			cx.beginPath();
			for (var q = 0; q < ln.length; q++) { var pp = proj(ln[q]); if (q) cx.lineTo(pp[0], pp[1]); else cx.moveTo(pp[0], pp[1]); }
			cx.stroke();
		});
		/* geodesics */
		if (paths) paths.forEach(function (p, idx) {
			cx.beginPath(); cx.strokeStyle = col.ln[idx % col.ln.length]; cx.lineWidth = 2.2;
			var started = false;
			p.pts.forEach(function (q) {
				if (s.disk && q[0] * q[0] + q[1] * q[1] > 0.99) return;
				var pp = proj(s.emb(q[0], q[1])); if (!started) { cx.moveTo(pp[0], pp[1]); started = true; } else cx.lineTo(pp[0], pp[1]);
			});
			cx.stroke();
		});
		var sp = proj(s.emb(startPt[0], startPt[1]));
		cx.beginPath(); cx.arc(sp[0], sp[1], 5, 0, 2 * pi); cx.fillStyle = col.st; cx.fill(); cx.strokeStyle = dark ? '#000' : '#fff'; cx.lineWidth = 2; cx.stroke();
		$('mt-gbadge').textContent = s.view === '3d' ? 'drag to rotate · wheel to zoom' : 'click to move the start point · wheel to zoom';
	}

	function loadSurf(id, fromUrl) {
		var s = surf(id); curS = s; S.gpre = s.id; elG.value = s.id; save();
		startPt = fromUrl && fromUrl.s ? fromUrl.s : s.s.slice();
		$('mt-gnote').textContent = s.note;
		$('mt-g-n').textContent = s.n; $('mt-g-s').textContent = 'coordinates (' + s.co.join(', ') + ')'; $('mt-g-m').textContent = s.ds;
		var s1 = $('mt-s1'), s2 = $('mt-s2');
		s1.min = s.rng[0][0]; s1.max = s.rng[0][1]; s2.min = s.rng[1][0]; s2.max = s.rng[1][1];
		s1.value = startPt[0]; s2.value = startPt[1];
		$('mt-gl').value = (fromUrl && fromUrl.len) || s.L; $('mt-gl').max = Math.max(40, s.L * 2);
		cam.zoom = 1; paths = null; updateReadouts(); resize(); draw();
	}
	function updateReadouts() {
		$('mt-s1-v').textContent = (+startPt[0]).toFixed(2); $('mt-s2-v').textContent = (+startPt[1]).toFixed(2);
		$('mt-gn-v').textContent = $('mt-gn').value; $('mt-ga-v').textContent = $('mt-ga').value; $('mt-gl-v').textContent = $('mt-gl').value;
		$('mt-g-p').textContent = '(' + (+startPt[0]).toFixed(2) + ', ' + (+startPt[1]).toFixed(2) + ')';
	}
	var gbusy = false, pending = false;
	function runGeo() {
		geoRan = true;
		if (gbusy) { pending = true; return; }
		var s = curS, gst = $('mt-gstatus');
		var n = +$('mt-gn').value, len = +$('mt-gl').value, steps = 700, h = len / steps;
		var fan = $('mt-gfan').checked, ang = +$('mt-ga').value * pi / 180;
		var req = { op: 'geodesics', coords: s.co, g: s.g, params: [], positive: s.pos || [], values: {}, start: startPt.slice(), n: n, steps: steps, h: h, a0: ang, spread: fan ? 2 * pi : 0.7, bounds: { lo: s.b[0], hi: s.b[1] } };
		gbusy = true; gst.className = 'mt-status'; gst.textContent = window.MESCAS.state() === 'ready' ? 'Computing…' : 'Starting the algebra engine (first use downloads ~10 MB)…';
		window.MESCAS.call(req, { timeout: 90000 }).then(function (r) {
			gbusy = false;
			if (!r || r.ok === false) { gst.className = 'mt-status err'; gst.textContent = (r && r.error) || 'Failed.'; paths = null; draw(); }
			else { paths = r.paths; gst.textContent = r.paths.length + ' geodesic' + (r.paths.length === 1 ? '' : 's') + ' drawn.'; draw(); }
			if (pending) { pending = false; runGeo(); }
		}, function (e) { gbusy = false; gst.className = 'mt-status err'; gst.textContent = e && e.message ? e.message : String(e); });
	}
	var gtimer = null;
	function later() { clearTimeout(gtimer); gtimer = setTimeout(runGeo, 350); }
	elG.addEventListener('change', function () { loadSurf(elG.value); runGeo(); });
	$('mt-grun').addEventListener('click', runGeo);
	$('mt-s1').addEventListener('input', function () { startPt[0] = +this.value; updateReadouts(); draw(); later(); });
	$('mt-s2').addEventListener('input', function () { startPt[1] = +this.value; updateReadouts(); draw(); later(); });
	['mt-gn', 'mt-ga', 'mt-gl'].forEach(function (id) { $(id).addEventListener('input', function () { updateReadouts(); later(); }); });
	$('mt-gfan').addEventListener('change', runGeo);
	$('mt-glink').addEventListener('click', function () {
		copy(linkFor('tab=geo&s=' + curS.id + '&p=' + startPt.map(function (v) { return (+v).toFixed(3); }).join(',') + '&n=' + $('mt-gn').value + '&a=' + $('mt-ga').value + '&l=' + $('mt-gl').value), this);
	});

	/* interaction on the canvas */
	var drag = null;
	cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, moved: false }; cv.style.cursor = 'grabbing'; });
	cv.addEventListener('pointermove', function (e) {
		if (!drag) return; var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
		if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
		if (curS.view === '3d' && drag.moved) { cam.yaw = drag.yaw + dx * 0.008; cam.pitch = Math.max(-1.45, Math.min(1.45, drag.pitch + dy * 0.008)); draw(); }
	});
	cv.addEventListener('pointerup', function (e) {
		cv.style.cursor = '';
		if (drag && !drag.moved && curS.view === '2d') {
			var r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, s = curS, sc2 = Math.min(W, H) * 0.46 / s.ext * cam.zoom, o = s.off || [0, 0];
			var a = (px - W / 2) / sc2 + o[0], b = -(py - H / 2) / sc2 + o[1];
			a = Math.max(s.rng[0][0], Math.min(s.rng[0][1], a)); b = Math.max(s.rng[1][0], Math.min(s.rng[1][1], b));
			startPt = [a, b]; $('mt-s1').value = a; $('mt-s2').value = b; updateReadouts(); draw(); runGeo();
		}
		drag = null;
	});
	cv.addEventListener('wheel', function (e) { e.preventDefault(); cam.zoom = Math.max(0.4, Math.min(5, cam.zoom * (e.deltaY < 0 ? 1.1 : 0.9))); draw(); }, { passive: false });
	new MutationObserver(draw).observe(document.body, { attributes: true, attributeFilter: ['class'] });

	/* ---------------- start-up ---------------- */
	var q = new URLSearchParams(location.search);
	var urlM = q.get('m');
	if (urlM && PRE.some(function (p) { return p.id === urlM; })) S.pre = urlM;
	loadPre(S.pre);
	if (q.get('c')) {
		elCo.value = q.get('c'); try { var gg = JSON.parse(q.get('g')); buildGrid(gg); } catch (e) { buildGrid(null); }
		elPa.value = q.get('pa') || ''; elPo.value = q.get('po') || '';
		if (!urlM) { elPre.value = 'custom'; S.pre = 'custom'; $('mt-pre-note').textContent = preById('custom').note; }
	}
	var fromUrl = null;
	if (q.get('s') && SURF.some(function (s) { return s.id === q.get('s'); })) {
		S.gpre = q.get('s'); var pp = (q.get('p') || '').split(',').map(Number);
		fromUrl = { s: pp.length === 2 && pp.every(isFinite) ? pp : null, len: q.get('l') };
		if (q.get('n')) $('mt-gn').value = q.get('n'); if (q.get('a')) $('mt-ga').value = q.get('a');
	}
	if (!q.get('n')) $('mt-gn').value = 14; if (!q.get('a')) $('mt-ga').value = 0;
	loadSurf(S.gpre, fromUrl);
	if (q.get('tab') === 'geo') showTab('geo');
	else if (q.get('run') === '1') runCompute();
})();
