/* MES Click Speed Test page (uses MESClick from lib.js). */
(function () {
	'use strict';
	var C = window.MESClick, $ = function (id) { return document.getElementById(id); };
	if (!C || !$('ct')) return;
	var KEY = 'mes-click-test:v1';
	var S = { secs: 10, custom: false, input: 'click', key: ' ', bests: {}, hist: [] };
	try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) {}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	var toastT; function toast(m) { var t = $('ct-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2200); }

	try { var q = new URLSearchParams(location.search).get('t'); if (q) { S.secs = C.clampSecs(q); S.custom = C.MODES.indexOf(S.secs) < 0; } } catch (e) {}
	S.secs = C.clampSecs(S.secs);

	/* ---- state of the current test ---- */
	var T = { st: 'idle', t0: 0, times: [], kind: 'mouse', end: 0, lockUntil: 0, raf: 0, timer: 0, res: null };
	var pointers = {};
	function dur() { return S.secs * 1000; }
	function kindFor(pt) { if (S.input === 'key') return 'key'; if (pt === 'touch') return S.input === 'multi' ? 'multi' : 'touch'; return 'mouse'; }

	function guessKind() { if (S.input === 'key') return 'key'; if (S.input === 'multi') return 'multi'; return window.matchMedia && matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse'; }

	/* ---- controls ---- */
	function renderModes() {
		var h = '';
		C.MODES.forEach(function (m) { h += '<button type="button" class="tu-chip" data-m="' + m + '" aria-pressed="' + (!S.custom && S.secs === m) + '">' + C.fmtSecs(m) + '</button>'; });
		h += '<button type="button" class="tu-chip" data-m="c" aria-pressed="' + S.custom + '">Custom</button>';
		$('ct-modes').innerHTML = h;
		$('ct-customw').hidden = !S.custom; if (S.custom) $('ct-custom').value = S.secs;
		[].forEach.call($('ct-inputs').children, function (b) { b.setAttribute('aria-pressed', String(b.dataset.i === S.input)); });
		$('ct-keyw').hidden = S.input !== 'key'; $('ct-key').value = S.key;
		var hint = { click: 'Click with the mouse or tap with one finger. Only one finger at a time counts.',
			multi: 'Every finger that touches the box counts, so you can drum with several fingers. Scores are kept apart from one-finger scores.',
			key: 'Press ' + (S.key === ' ' ? 'the Space bar' : S.key === 'any' ? 'any key' : 'the ' + S.key + ' key') + ' as fast as you can. Holding it down only counts once.' };
		$('ct-hint').textContent = hint[S.input];
		reset();
	}
	$('ct-modes').addEventListener('click', function (e) {
		var b = e.target.closest('[data-m]'); if (!b || T.st === 'run') return;
		if (b.dataset.m === 'c') { S.custom = true; S.secs = C.clampSecs($('ct-custom').value); }
		else { S.custom = false; S.secs = +b.dataset.m; }
		save(); renderModes(); if (S.custom) $('ct-custom').focus();
	});
	$('ct-custom').addEventListener('change', function () { S.secs = C.clampSecs(this.value); this.value = S.secs; save(); reset(); });
	$('ct-inputs').addEventListener('click', function (e) { var b = e.target.closest('[data-i]'); if (!b || T.st === 'run') return; S.input = b.dataset.i; save(); renderModes(); });
	$('ct-key').addEventListener('change', function () { S.key = this.value; save(); renderModes(); });

	/* ---- test ---- */
	function reset() {
		cancelAnimationFrame(T.raf); clearTimeout(T.timer);
		T.st = 'idle'; T.times = []; T.res = null; pointers = {};
		$('ct-pad').classList.remove('is-run', 'is-done', 'is-lock');
		var msg = S.input === 'key' ? (S.key === ' ' ? 'Press the Space bar to start' : 'Press ' + (S.key === 'any' ? 'any key' : S.key) + ' to start') : 'Click here to start';
		$('ct-padmsg').innerHTML = '<b>' + msg + '</b><span>' + C.fmtSecs(S.secs) + ' test. The timer starts with your first ' + (S.input === 'key' ? 'press' : 'click') + '.</span>';
		$('ct-padmsg').hidden = false; $('ct-big').textContent = '';
		paintLive(0);
		drawChart($('ct-live-chart'), [], dur(), false);
	}
	function hit(kind, x, y) {
		var now = performance.now();
		if (T.st === 'done' || now < T.lockUntil) return false;
		if (T.st === 'idle') {
			T.st = 'run'; T.t0 = now; T.times = []; T.kind = kind;
			$('ct-padmsg').hidden = true; $('ct-pad').classList.add('is-run'); $('ct-res').hidden = true;
			T.timer = setTimeout(finish, dur() + 5);
			T.raf = requestAnimationFrame(loop);
		}
		var t = now - T.t0; if (t >= dur()) { finish(); return false; }
		T.times.push(t);
		if (x != null) ripple(x, y);
		return true;
	}
	function loop() {
		if (T.st !== 'run') return;
		var el = performance.now() - T.t0;
		if (el >= dur()) { finish(); return; }
		paintLive(el);
		if (!loop.n || ++loop.n % 3 === 0) drawChart($('ct-live-chart'), T.times, dur(), false, el);
		loop.n = loop.n || 1;
		T.raf = requestAnimationFrame(loop);
	}
	function paintLive(el) {
		var n = T.times.length, left = Math.max(0, dur() - el) / 1000;
		$('ct-left').textContent = left >= 10 ? left.toFixed(0) : left.toFixed(1);
		$('ct-count').textContent = n;
		$('ct-cps').textContent = el > 250 ? C.fmt(n / (el / 1000)) : (n ? '…' : '0.00');
		var last = 0; for (var i = n - 1; i >= 0 && el - T.times[i] < 1000; i--) last++;
		$('ct-now').textContent = last;
		$('ct-big').textContent = n || '';
		var best = S.bests[C.key(S.secs, T.st === 'idle' ? guessKind() : T.kind)], p = T.st === 'run' ? C.pace(n, el, best, dur()) : null;
		var pe = $('ct-pace');
		pe.textContent = p == null ? (best ? best.clicks + ' to beat' : '–') : (p >= 0 ? '+' : '') + Math.round(p);
		pe.className = p == null ? '' : p >= 0 ? 'ct-up' : 'ct-down';
		$('ct-prog').style.width = Math.min(100, el / dur() * 100) + '%';
	}
	function finish() {
		if (T.st !== 'run') return;
		cancelAnimationFrame(T.raf); clearTimeout(T.timer);
		T.st = 'done'; T.lockUntil = performance.now() + 900;
		var pad = $('ct-pad'); pad.classList.remove('is-run'); pad.classList.add('is-done', 'is-lock');
		setTimeout(function () { pad.classList.remove('is-lock'); }, 900);
		paintLive(dur());
		var r = C.stats(T.times, dur()); T.res = r;
		var k = C.key(S.secs, T.kind), b = C.addBest(S.bests, k, r, Date.now());
		S.bests = b.bests;
		S.hist.unshift({ d: Date.now(), s: S.secs, k: T.kind, c: r.clicks, p: Math.round(r.cps * 100) / 100, pk: r.peak1s });
		S.hist = S.hist.slice(0, 12); save();
		$('ct-padmsg').innerHTML = '<b>' + r.clicks + ' clicks · ' + C.fmt(r.cps) + ' CPS</b><span>Click again (or press Try again) for a new test.</span>';
		$('ct-padmsg').hidden = false; $('ct-big').textContent = '';
		showResult(r, b);
		drawChart($('ct-live-chart'), T.times, dur(), false, dur());
		renderBests();
	}
	function showResult(r, b) {
		$('ct-res').hidden = false;
		$('ct-rcps').textContent = C.fmt(r.cps);
		var tr = C.tier(r.cps); $('ct-rtier').textContent = tr.name;
		$('ct-rtext').textContent = r.clicks + ' ' + (T.kind === 'key' ? 'presses' : T.kind === 'mouse' ? 'clicks' : 'taps') + ' in ' + C.fmtSecs(S.secs) + ' with ' + C.KINDS[T.kind].toLowerCase() + '. ' + tr.text;
		$('ct-rnew').hidden = !b.best;
		var cells = [['Clicks', r.clicks], ['Fastest second', r.peak1s], ['Average gap', r.gapAvg == null ? '–' : Math.round(r.gapAvg) + ' ms'],
			['Shortest gap', r.gapMin == null ? '–' : Math.round(r.gapMin) + ' ms'], ['Even rhythm', r.consistency == null ? '–' : r.consistency + '%'],
			['Best (this test)', (S.bests[C.key(S.secs, T.kind)] || {}).clicks || '–']];
		if (S.secs === 60) cells.push(['vs 760 record', (r.clicks - 760 >= 0 ? '+' : '') + (r.clicks - 760)]);
		$('ct-rgrid').innerHTML = cells.map(function (c) { return '<div class="ct-cell"><span>' + c[0] + '</span><b>' + c[1] + '</b></div>'; }).join('');
		var list = C.REFS.map(function (x) { return { label: x.label, cps: x.cps, ref: true }; });
		list.push({ label: 'You (' + C.KINDS[T.kind].toLowerCase() + ')', cps: r.cps, you: true });
		list.sort(function (a, b) { return a.cps - b.cps; });
		var mx = Math.max.apply(null, list.map(function (x) { return x.cps; }));
		$('ct-cmp').innerHTML = list.map(function (x) {
			return '<div class="ct-crow2' + (x.you ? ' ct-you' : '') + '"><span class="ct-cl">' + esc(x.label) + '</span><span class="ct-cb"><i style="width:' + (x.cps / mx * 100).toFixed(1) + '%"></i></span><b>' + C.fmt(x.cps, 1) + '</b></div>';
		}).join('');
		drawChart($('ct-res-chart'), T.times, dur(), true);
		if (window.matchMedia && !window.matchMedia('(min-width: 900px)').matches) setTimeout(function () { try { $('ct-res').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {} }, 950);
	}
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
	function ripple(x, y) {
		var pad = $('ct-pad'), r = pad.getBoundingClientRect(), d = document.createElement('span');
		d.className = 'ct-rip'; d.style.left = (x - r.left) + 'px'; d.style.top = (y - r.top) + 'px';
		pad.appendChild(d); setTimeout(function () { d.remove(); }, 450);
		var rips = pad.querySelectorAll('.ct-rip'); if (rips.length > 24) rips[0].remove();
	}

	/* ---- input ---- */
	var pad = $('ct-pad');
	pad.addEventListener('pointerdown', function (e) {
		if (S.input === 'key') { pad.focus(); return; }
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		e.preventDefault();
		if (T.st === 'done' && performance.now() >= T.lockUntil) reset();
		if (e.pointerType === 'touch' && S.input !== 'multi' && Object.keys(pointers).length) { pointers[e.pointerId] = 1; return; }
		pointers[e.pointerId] = 1;
		hit(kindFor(e.pointerType), e.clientX, e.clientY);
	});
	function up(e) { delete pointers[e.pointerId]; }
	pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up); pad.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'mouse') up(e); });
	['contextmenu', 'dblclick', 'selectstart', 'dragstart'].forEach(function (ev) { pad.addEventListener(ev, function (e) { e.preventDefault(); }); });
	pad.addEventListener('touchstart', function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
	document.addEventListener('keydown', function (e) {
		if (S.input !== 'key' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
		var tg = e.target; if (tg && /^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || (tg && tg.isContentEditable)) return;
		var ok = S.key === 'any' ? e.key.length === 1 || e.key === 'Enter' : e.key.toLowerCase() === S.key.toLowerCase();
		if (!ok) return;
		var r = pad.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
		e.preventDefault();
		if (T.st === 'done' && performance.now() >= T.lockUntil) reset();
		hit('key', r.left + r.width * (0.2 + Math.random() * 0.6), r.top + r.height * (0.25 + Math.random() * 0.5));
	});
	$('ct-again').addEventListener('click', function () { reset(); $('ct-res').hidden = true; try { pad.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} pad.focus({ preventScroll: true }); });
	$('ct-copy').addEventListener('click', function () {
		if (!T.res) return; var txt = C.shareText(T.res, T.kind);
		(navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Result copied'); }, function () { toast('Could not copy'); });
	});

	/* ---- chart ---- */
	function cssv(n, d) { var v = getComputedStyle($('ct')).getPropertyValue(n).trim(); return v || d; }
	function drawChart(cv, times, d, full, upTo) {
		var box = cv.parentNode, w = box.clientWidth, h = box.clientHeight; if (!w || !h) return;
		var dpr = window.devicePixelRatio || 1;
		if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
		var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
		var grid = cssv('--ct-grid', '#e3e7ec'), muted = cssv('--ct-muted', '#5b6573'), acc = cssv('--ct-line', '#e8590c'), barc = cssv('--ct-barfill', 'rgba(232,89,12,.18)');
		var end = upTo == null ? d : upTo, ser = end > 0 ? C.series(times, Math.max(100, end), d > 30000 ? 250 : 100) : [];
		var bars = full ? C.perSecond(times, d) : [];
		var mx = C.niceMax(Math.max(5, Math.max.apply(null, ser.map(function (p) { return p.cps; }).concat(bars, [0]))));
		var L = 30, R = 8, Tp = 8, B = full ? 22 : 16, pw = w - L - R, ph = h - Tp - B;
		var X = function (t) { return L + t / d * pw; }, Y = function (v) { return Tp + ph - v / mx * ph; };
		g.font = '11px system-ui, sans-serif'; g.fillStyle = muted; g.strokeStyle = grid; g.lineWidth = 1; g.textAlign = 'right'; g.textBaseline = 'middle';
		var stp = mx <= 10 ? 2 : mx <= 25 ? 5 : mx <= 50 ? 10 : 25;
		for (var v = 0; v <= mx; v += stp) { g.beginPath(); g.moveTo(L, Y(v) + 0.5); g.lineTo(w - R, Y(v) + 0.5); g.stroke(); g.fillText(v, L - 5, Y(v)); }
		g.textAlign = 'center'; g.textBaseline = 'top';
		var secs = d / 1000, xs = secs <= 10 ? 1 : secs <= 30 ? 5 : secs <= 120 ? 10 : 60;
		for (var s = 0; s <= secs + 1e-9; s += xs) g.fillText(s + (s === 0 ? '' : 's'), X(s * 1000), h - B + 4);
		if (bars.length) { g.fillStyle = barc; var bw = pw / (d / 1000); bars.forEach(function (n, i) { var x0 = X(i * 1000), x1 = Math.min(X(d), x0 + bw); g.fillRect(x0 + 1, Y(n), Math.max(1, x1 - x0 - 2), Tp + ph - Y(n)); }); }
		if (ser.length) {
			g.strokeStyle = acc; g.lineWidth = 2.2; g.lineJoin = 'round'; g.beginPath();
			g.moveTo(X(0), Y(ser[0].cps));
			ser.forEach(function (p) { g.lineTo(X(p.t), Y(p.cps)); }); g.stroke();
		}
		if (full) {
			var st = C.stats(times, d); g.setLineDash([5, 4]); g.strokeStyle = muted; g.lineWidth = 1; g.beginPath(); g.moveTo(L, Y(st.cps)); g.lineTo(w - R, Y(st.cps)); g.stroke(); g.setLineDash([]);
			g.fillStyle = muted; g.textAlign = 'left'; g.textBaseline = 'bottom'; g.fillText('average ' + C.fmt(st.cps, 1), L + 4, Y(st.cps) - 2);
			cv._ser = ser; cv._X = X; cv._d = d; cv._bars = bars;
		}
	}
	(function tip() {
		var cv = $('ct-res-chart'), tp = $('ct-tip');
		function move(e) {
			if (!cv._ser || !cv._ser.length) return; var r = cv.getBoundingClientRect(), x = e.clientX - r.left;
			var t = Math.max(0, Math.min(cv._d, (x - 30) / (r.width - 38) * cv._d)), best = cv._ser[0];
			cv._ser.forEach(function (p) { if (Math.abs(p.t - t) < Math.abs(best.t - t)) best = p; });
			var sec = Math.min(cv._bars.length - 1, Math.floor(t / 1000));
			tp.hidden = false; tp.textContent = (best.t / 1000).toFixed(1) + ' s: ' + C.fmt(best.cps, 1) + ' CPS · second ' + (sec + 1) + ': ' + cv._bars[sec] + ' clicks';
			tp.style.left = Math.max(0, Math.min(r.width - tp.offsetWidth, x - tp.offsetWidth / 2)) + 'px';
		}
		cv.addEventListener('pointermove', move); cv.addEventListener('pointerdown', move);
		cv.addEventListener('pointerleave', function () { tp.hidden = true; });
	})();

	/* ---- bests + history ---- */
	function renderBests() {
		var kinds = ['mouse', 'touch', 'multi', 'key'], modes = C.MODES.slice();
		Object.keys(S.bests).forEach(function (k) { var s = +k.split('|')[0]; if (modes.indexOf(s) < 0) modes.push(s); });
		modes.sort(function (a, b) { return a - b; });
		$('ct-best').innerHTML = modes.map(function (m) {
			return '<tr' + (m === S.secs ? ' class="ct-cur"' : '') + '><th>' + C.fmtSecs(m) + '</th>' + kinds.map(function (k) {
				var b = S.bests[m + '|' + k]; return '<td>' + (b ? '<b>' + b.clicks + '</b> <span class="ct-dim">' + C.fmt(b.cps, 1) + ' CPS</span>' : '<span class="ct-dim">–</span>') + '</td>';
			}).join('') + '</tr>';
		}).join('');
		$('ct-hist').innerHTML = S.hist.length ? S.hist.map(function (h) {
			return '<li><b>' + h.c + '</b> in ' + C.fmtSecs(h.s) + ' · ' + C.fmt(h.p) + ' CPS · ' + C.KINDS[h.k] + ' <span class="ct-dim">' + new Date(h.d).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</span></li>';
		}).join('') : '<li class="ct-dim">No tries yet.</li>';
	}
	$('ct-clear').addEventListener('click', function () {
		if (!Object.keys(S.bests).length && !S.hist.length) return;
		if (!confirm('Clear all your best scores and recent tries in this browser?')) return;
		S.bests = {}; S.hist = []; save(); renderBests(); paintLive(0); toast('Cleared');
	});

	/* ---- fill window / resize ---- */
	function redraw() { if (T.st !== 'run') drawChart($('ct-live-chart'), T.times, dur(), false, T.st === 'done' ? dur() : 0); if (T.res) drawChart($('ct-res-chart'), T.times, dur(), true); }
	var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(redraw, 80); });
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(redraw, 60); }).observe($('ct-view'));
	(function panels() {
		if (!window.MESPanel) { if (document.readyState !== 'complete') return void setTimeout(panels, 200); return; }
		window.MESPanel.add($('ct-view'), { bar: $('ct-vbtns'), onChange: function () { setTimeout(redraw, 40); } });
	})();
	window.MESClickDebug = { S: S, T: T, hit: hit, finish: finish, reset: reset };

	renderModes(); renderBests();
})();
