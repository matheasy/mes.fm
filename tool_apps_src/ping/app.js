/* MES Ping Test UI. Maths = MESPing in lib.js (prepended above). Settings in localStorage mes-ping:v1; samples are never stored or sent anywhere. */
(function () {
	'use strict';
	var P = MESPing, $ = function (id) { return document.getElementById(id); }, KEY = 'mes-ping:v1';
	var BUILT = [
		{ id: 'cf1', name: '1.1.1.1', label: 'Cloudflare DNS 1.1.1.1', url: 'https://1.1.1.1/cdn-cgi/trace' },
		{ id: 'g8', name: '8.8.8.8', label: 'Google DNS 8.8.8.8', url: 'https://8.8.8.8/resolve?name=.&type=NS' },
		{ id: 'cf', name: 'cloudflare.com', label: 'Cloudflare', url: 'https://www.cloudflare.com/cdn-cgi/trace' },
		{ id: 'g', name: 'google.com', label: 'Google', url: 'https://www.google.com/generate_204' },
		{ id: 'mes', name: 'mes.fm', label: 'mes.fm', url: '/ping/pong.txt', same: true }
	];
	var COLORS = ['#2563eb', '#16a34a', '#ea580c', '#9333ea', '#0891b2', '#db2777', '#ca8a04', '#64748b'];
	var S = { on: ['cf1', 'g8', 'mes'], custom: [], iv: 1, to: 2000, count: 0, span: 60, follow: true };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv) for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	S.iv = P.clampInterval(S.iv);
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
	function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }
	var toastT; function toast(m) { var t = $('pg-toast'); t.textContent = m; t.classList.add('tu-toast--show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('tu-toast--show'); }, 2200); }

	function all() { return BUILT.concat(S.custom.map(function (c) { return { id: c.id, name: c.host, label: c.host, url: c.url, custom: true }; })); }
	function colorOf(id) { var i = all().map(function (t) { return t.id; }).indexOf(id); return COLORS[(i < 0 ? 0 : i) % COLORS.length]; }

	/* run state, per target id: { samples: [{t, ms, warm, err, at}], n, timer, busy, warm } */
	var R = {}, T0 = 0, running = false, rows = [], logLines = [];
	try { if (performance.setResourceTimingBufferSize) performance.setResourceTimingBufferSize(2000); } catch (e) {}

	/* ---------- targets ---------- */
	function drawTargets() {
		$('pg-targets').innerHTML = all().map(function (t) {
			var on = S.on.indexOf(t.id) >= 0;
			return '<span class="pg-tgt' + (on ? ' on' : '') + '" style="--c:' + colorOf(t.id) + '"><button type="button" class="pg-tbtn" data-id="' + t.id + '" aria-pressed="' + on + '" title="' + esc(t.url) + '"><span class="pg-dot"></span>' + esc(t.label) + '</button>' +
				(t.custom ? '<button type="button" class="pg-tx" data-x="' + t.id + '" aria-label="Remove ' + esc(t.label) + '">✕</button>' : '') + '</span>';
		}).join('');
	}
	$('pg-targets').onclick = function (e) {
		var b = e.target.closest('[data-id]'), x = e.target.closest('[data-x]');
		if (x) { var id = x.getAttribute('data-x'); S.custom = S.custom.filter(function (c) { return c.id !== id; }); S.on = S.on.filter(function (o) { return o !== id; }); stopOne(id); delete R[id]; save(); drawTargets(); renderAll(); return; }
		if (!b) return;
		var id2 = b.getAttribute('data-id'), i = S.on.indexOf(id2);
		if (i >= 0) { S.on.splice(i, 1); stopOne(id2); } else { S.on.push(id2); if (running) startOne(find(id2)); }
		save(); drawTargets(); renderAll();
		if (running && !S.on.length) stop();
	};
	function find(id) { return all().filter(function (t) { return t.id === id; })[0]; }
	$('pg-add').onsubmit = function (e) {
		e.preventDefault();
		var r = P.parseTarget($('pg-host').value); $('pg-adderr').textContent = r.error || '';
		if (r.error) return;
		if (all().some(function (t) { return t.url === r.url; })) { $('pg-adderr').textContent = 'Already in the list.'; return; }
		if (S.custom.length >= 5) { $('pg-adderr').textContent = 'Up to 5 of your own.'; return; }
		var id = 'c' + Date.now().toString(36);
		S.custom.push({ id: id, host: r.host, url: r.url }); S.on.push(id); $('pg-host').value = '';
		save(); drawTargets(); if (running) startOne(find(id)); renderAll();
	};

	/* ---------- probing ---------- */
	function resTiming(url) {
		try { var es = performance.getEntriesByName(url, 'resource'); return es.length ? es[es.length - 1] : null; } catch (e) { return null; }
	}
	function probe(t) {
		var st = R[t.id]; if (!st || st.busy) return;
		st.busy = true; st.n++;
		var url = P.bust(t.url, Date.now().toString(36) + st.n), ctl = window.AbortController ? new AbortController() : null;
		var timer = setTimeout(function () { if (ctl) ctl.abort(); done(null, 'timeout'); }, S.to), t1 = performance.now(), finished = false;
		var opts = { cache: 'no-store', mode: t.same ? 'same-origin' : 'no-cors', credentials: 'omit', redirect: 'follow', referrerPolicy: 'no-referrer' };
		if (ctl) opts.signal = ctl.signal;
		fetch(url, opts).then(function (res) {
			/* read the (tiny) body so the timing covers the whole answer */
			return (t.same && res.text ? res.text() : Promise.resolve()).then(function () { done(performance.now() - t1); });
		}, function (err) { done(null, err && err.name === 'AbortError' ? 'timeout' : 'fail'); });
		function done(ms, err) {
			if (finished) return; finished = true; clearTimeout(timer); st.busy = false;
			if (R[t.id] !== st) return;
			var warm = !st.warmed && ms != null;
			if (ms != null) {
				var e = resTiming(new URL(url, location.href).href);
				if (e) {
					/* full timings exist for mes.fm (same site) and for servers that send Timing-Allow-Origin */
					/* request sent -> first byte back: leaves out name lookup and connecting, even if the browser had to reconnect */
					if (e.responseStart > 0 && e.requestStart > 0) { if (!warm) ms = e.responseStart - e.requestStart; }
					else if (e.duration > 0) ms = e.duration;
				}
				if (warm) st.warmed = true;
				try { performance.clearResourceTimings && st.n % 200 === 0 && performance.clearResourceTimings(); } catch (e2) {}
			}
			var s = { t: performance.now() - T0, at: Date.now(), ms: ms, warm: warm, err: err };
			st.samples.push(s); if (st.samples.length > 20000) st.samples.splice(0, 5000);
			if (warm) st.warmMs = ms;
			rows.push({ target: t.name, at: s.at, ms: ms, warm: warm, err: err }); if (rows.length > 50000) rows.splice(0, 10000);
			log(P.line(t.name, s), ms == null ? 'bad' : warm ? 'warm' : '', t.id);
			if (S.count && countDone(st) >= S.count + 1) stopOne(t.id, true);
			dirty = true;
		}
	}
	function countDone(st) { return st.samples.length; }
	function startOne(t) {
		if (!t) return;
		if (!R[t.id]) R[t.id] = { samples: [], n: 0, busy: false, warmed: false, warmMs: null };
		var st = R[t.id]; if (st.timer) return;
		st.done = false; st.warmed = false;
		log('', '', t.id);
		log('Pinging ' + t.name + ' over HTTPS (' + t.url.replace(/\?.*/, '') + '):', 'head', t.id);
		probe(t);
		st.timer = setInterval(function () { probe(t); }, S.iv * 1000);
	}
	function stopOne(id, finished) {
		var st = R[id]; if (!st || !st.timer) return;
		clearInterval(st.timer); st.timer = null;
		var t = find(id);
		if (t && st.samples.length) P.summaryLines(t.name, P.stats(st.samples)).forEach(function (l, i) { log(l, i === 1 ? 'head' : 'sum', id); });
		if (finished && running && !S.on.some(function (o) { return R[o] && R[o].timer; })) stop(true);
	}
	function start() {
		if (!S.on.length) { toast('Pick at least one place to ping'); return; }
		if (!T0 || !anySamples()) T0 = performance.now();
		running = true; S.on.forEach(function (id) { var t = find(id); if (t) { if (R[id] && S.count) { R[id].samples = []; } startOne(t); } });
		paintGo(); status();
	}
	function stop(quiet) {
		running = false; Object.keys(R).forEach(function (id) { stopOne(id); });
		paintGo(); status();
		renderAll();
	}
	function anySamples() { return Object.keys(R).some(function (id) { return R[id].samples.length; }); }
	function paintGo() { var b = $('pg-go'); b.textContent = running ? '■ Stop' : '▶ Start'; b.classList.toggle('pg-stop', running); }
	function status() {
		$('pg-status').textContent = running ? 'Pinging ' + S.on.length + (S.on.length === 1 ? ' place' : ' places') + ' every ' + S.iv + ' s' + (S.count ? ', ' + S.count + ' times each.' : ' until you press Stop.') :
			anySamples() ? 'Stopped. Press Start to carry on, or Clear to start over.' : 'Press Start. The first reply from each place opens the connection, so it is shown as a warm-up and not counted.';
	}
	$('pg-go').onclick = function () { if (running) stop(); else start(); };
	document.addEventListener('keydown', function (e) { if (e.target.closest && e.target.closest('input,select,textarea')) return; if (e.ctrlKey && (e.key === 'c' || e.key === 'C') && running && !String(window.getSelection())) { stop(); } });

	/* settings */
	$('pg-int').value = S.iv; $('pg-intv').textContent = S.iv; $('pg-to').value = String(S.to); $('pg-count').value = String(S.count); $('pg-follow').checked = S.follow;
	$('pg-int').oninput = function () {
		S.iv = P.clampInterval(this.value); $('pg-intv').textContent = S.iv; save();
		if (running) Object.keys(R).forEach(function (id) { var st = R[id]; if (st.timer) { clearInterval(st.timer); var t = find(id); st.timer = setInterval(function () { probe(t); }, S.iv * 1000); } });
		status();
	};
	$('pg-to').onchange = function () { S.to = +this.value; save(); };
	$('pg-count').onchange = function () { S.count = +this.value; save(); status(); };
	$('pg-follow').onchange = function () { S.follow = this.checked; save(); if (S.follow) scrollLog(); };

	/* ---------- log ---------- */
	var logEl = $('pg-log'), MAXLOG = 3000;
	function log(text, cls, id) {
		var d = document.createElement('div'); d.className = 'pg-l' + (cls ? ' pg-l--' + cls : ''); d.textContent = text || ' ';
		if (id && text) d.style.setProperty('--c', colorOf(id));
		logEl.appendChild(d); logLines.push(text);
		if (logLines.length > MAXLOG) { logLines.splice(0, 500); for (var i = 0; i < 500 && logEl.firstChild; i++) logEl.removeChild(logEl.firstChild); }
		if (S.follow) scrollLog();
	}
	function scrollLog() { logEl.scrollTop = logEl.scrollHeight; }
	$('pg-copy').onclick = function () {
		var txt = logLines.join('\n').trim(); if (!txt) { toast('Nothing to copy yet'); return; }
		(navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Log copied'); }, function () { toast('Could not copy'); });
	};
	$('pg-csv').onclick = function () {
		if (!rows.length) { toast('Nothing to save yet'); return; }
		var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([P.toCSV(rows)], { type: 'text/csv' }));
		a.download = 'ping-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.csv'; document.body.appendChild(a); a.click();
		setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
	};
	$('pg-clear').onclick = function () {
		var was = running; if (running) stop(true);
		R = {}; rows = []; logLines = []; logEl.innerHTML = ''; T0 = 0; renderAll(); status();
		if (was) start();
	};

	/* ---------- table + verdicts ---------- */
	function renderTable() {
		var ids = all().map(function (t) { return t.id; }).filter(function (id) { return S.on.indexOf(id) >= 0 || (R[id] && R[id].samples.length); });
		$('pg-tbody').innerHTML = ids.length ? ids.map(function (id) {
			var t = find(id), st = R[id], s = st ? P.stats(st.samples) : P.stats([]), last = st && st.samples.length ? st.samples[st.samples.length - 1] : null;
			return '<tr><td><span class="pg-dot" style="--c:' + colorOf(id) + '"></span>' + esc(t.label) + '</td><td>' + (last ? (last.ms == null ? '<span class="pg-bad">lost</span>' : P.fmtMs(last.ms)) : '–') + '</td><td>' + P.fmtMs(s.min) + '</td><td><b>' + P.fmtMs(s.avg) + '</b></td><td>' + P.fmtMs(s.max) + '</td><td>' + P.fmtMs(s.jitter) + '</td><td' + (s.lost ? ' class="pg-bad"' : '') + '>' + s.lost + ' / ' + s.sent + (s.sent ? ' (' + P.fmtPct(s.lossPct) + ')' : '') + '</td><td>' + (st && st.warmMs != null ? P.fmtMs(st.warmMs) : '–') + '</td></tr>';
		}).join('') : '<tr><td colspan="8">Pick a place to ping above.</td></tr>';
	}
	function renderVerdicts() {
		/* judge by the fastest target with enough replies: one far-away server should not make a good connection look bad */
		var best = null;
		Object.keys(R).forEach(function (id) { var s = P.stats(P.lastN(R[id].samples, 120)); if (s.sent >= 5 && (!best || (s.avg != null ? s.avg : 1e9) < (best.s.avg != null ? best.s.avg : 1e9))) best = { id: id, s: s }; });
		if (!best) { $('pg-vbasis').textContent = anySamples() ? 'Needs at least 5 replies from one place.' : 'Start the test to see.'; $('pg-verdicts').innerHTML = ''; return; }
		var t = find(best.id), s = best.s;
		$('pg-vbasis').innerHTML = 'Based on the last ' + s.sent + ' requests to <b>' + esc(t ? t.label : best.id) + '</b> (your fastest): average ' + P.fmtMs(s.avg) + ' ms, jitter ' + P.fmtMs(s.jitter) + ' ms, ' + P.fmtPct(s.lossPct) + ' lost.';
		$('pg-verdicts').innerHTML = P.USES.map(function (u) {
			var v = P.verdict(s, u), cls = v.level === 3 ? 'good' : v.level === 2 ? 'ok' : v.level === 1 ? 'poor' : 'wait';
			return '<div class="pg-v pg-v--' + cls + '"><div class="pg-vn">' + u.name + '</div><div class="pg-vw">' + v.word + '</div><div class="pg-vy">' + esc(v.why) + '</div></div>';
		}).join('');
	}

	/* ---------- chart ---------- */
	var cv = $('pg-chart'), box = $('pg-chartbox'), hoverX = null;
	function spanChips() { [].forEach.call($('pg-span').children, function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-s') === S.span)); }); }
	$('pg-span').onclick = function (e) { var b = e.target.closest('[data-s]'); if (!b) return; S.span = +b.getAttribute('data-s'); save(); spanChips(); drawChart(); };
	function cssVar(n, d) { var v = getComputedStyle($('pg')).getPropertyValue(n).trim(); return v || d; }
	var geo = null;
	function drawChart() {
		var W = box.clientWidth, H = box.clientHeight, dpr = window.devicePixelRatio || 1;
		if (!W || !H) return;
		cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
		var c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
		var now = performance.now() - T0, ids = Object.keys(R).filter(function (id) { return R[id].samples.length; });
		var tMax = Math.max(now, 1000), tMin = S.span ? tMax - S.span * 1000 : 0;
		if (!S.span) ids.forEach(function (id) { var f = R[id].samples[0]; if (f && f.t < tMin) tMin = f.t; });
		var yMaxRaw = 0;
		ids.forEach(function (id) { R[id].samples.forEach(function (s) { if (s.t >= tMin && s.ms != null && !s.warm && s.ms > yMaxRaw) yMaxRaw = s.ms; }); });
		var yMax = P.niceMax(yMaxRaw * 1.1), L = 50, Rr = 10, Tp = 14, B = 24, pw = W - L - Rr, ph = H - Tp - B;
		var x = function (t) { return L + (t - tMin) / Math.max(1, tMax - tMin) * pw; }, y = function (v) { return Tp + ph - Math.min(v, yMax) / yMax * ph; };
		geo = { x: x, tMin: tMin, tMax: tMax, L: L, pw: pw, y: y, ids: ids };
		var grid = cssVar('--pg-grid', '#e3e7ec'), txt = cssVar('--pg-muted', '#5b6573');
		c.font = '11px system-ui, sans-serif'; c.fillStyle = txt; c.strokeStyle = grid; c.lineWidth = 1;
		for (var i = 0; i <= 4; i++) { var v = yMax / 4 * i, yy = Math.round(y(v)) + 0.5; c.beginPath(); c.moveTo(L, yy); c.lineTo(W - Rr, yy); c.stroke(); c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(P.fmtMs(v), L - 6, yy); }
		c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('ms', 4, Tp + ph / 2);
		var spanS = (tMax - tMin) / 1000, step = [5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200].filter(function (s) { return spanS / s <= 7; })[0] || 14400;
		c.textAlign = 'center';
		for (var ts = Math.max(0, Math.ceil(tMin / 1000 / step) * step); ts * 1000 <= tMax; ts += step) { var xx = x(ts * 1000); c.fillText(fmtT(ts), xx, H - B + 6); c.beginPath(); c.moveTo(Math.round(xx) + 0.5, Tp); c.lineTo(Math.round(xx) + 0.5, Tp + ph); c.globalAlpha = 0.5; c.stroke(); c.globalAlpha = 1; }
		if (!ids.length) { c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = txt; c.font = '14px system-ui, sans-serif'; c.fillText('Press Start to see the chart', L + pw / 2, Tp + ph / 2); return; }
		ids.forEach(function (id) {
			var col = colorOf(id), pen = false; c.strokeStyle = col; c.lineWidth = 2; c.lineJoin = 'round'; c.beginPath();
			R[id].samples.forEach(function (s) {
				if (s.t < tMin - 2000) return;
				if (s.ms == null || s.warm) { pen = false; return; }
				if (pen) c.lineTo(x(s.t), y(s.ms)); else c.moveTo(x(s.t), y(s.ms)); pen = true;
			});
			c.stroke();
			c.fillStyle = col;
			R[id].samples.forEach(function (s) { if (s.t >= tMin && s.ms != null && !s.warm && s.ms > yMax) { c.beginPath(); c.moveTo(x(s.t), Tp); c.lineTo(x(s.t) - 4, Tp + 7); c.lineTo(x(s.t) + 4, Tp + 7); c.fill(); } });
			c.fillStyle = '#dc2626';
			R[id].samples.forEach(function (s) { if (s.t >= tMin && s.ms == null) c.fillRect(x(s.t) - 1.5, Tp - 12, 3, 9); });
		});
		if (hoverX != null) {
			c.strokeStyle = txt; c.lineWidth = 1; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(hoverX + 0.5, Tp); c.lineTo(hoverX + 0.5, Tp + ph); c.stroke(); c.setLineDash([]);
		}
		$('pg-legend').innerHTML = ids.map(function (id) { var t = find(id); return '<span><span class="pg-dot" style="--c:' + colorOf(id) + '"></span>' + esc(t ? t.name : id) + '</span>'; }).join('');
	}
	function fmtT(s) { s = Math.max(0, Math.round(s)); var m = Math.floor(s / 60), h = Math.floor(m / 60); return h ? h + ':' + pad(m % 60) + ':' + pad(s % 60) : m + ':' + pad(s % 60); }
	function pad(n) { return (n < 10 ? '0' : '') + n; }
	function tip(clientX) {
		if (!geo) return;
		var r = box.getBoundingClientRect(), px = clientX - r.left;
		if (px < geo.L || px > geo.L + geo.pw) { hideTip(); return; }
		hoverX = px; var t = geo.tMin + (px - geo.L) / geo.pw * (geo.tMax - geo.tMin), html = '<b>' + fmtT(t / 1000) + '</b>';
		geo.ids.forEach(function (id) {
			var best = null, bd = 1e12; R[id].samples.forEach(function (s) { var d = Math.abs(s.t - t); if (d < bd) { bd = d; best = s; } });
			if (best && bd < Math.max(S.iv * 1000, 1500)) { var tg = find(id); html += '<div><span class="pg-dot" style="--c:' + colorOf(id) + '"></span>' + esc(tg ? tg.name : id) + ': ' + (best.ms == null ? 'lost' : P.fmtMs(best.ms) + ' ms' + (best.warm ? ' (warm-up)' : '')) + '</div>'; }
		});
		var el = $('pg-tip'); el.innerHTML = html; el.hidden = false;
		el.style.left = Math.min(px + 12, r.width - el.offsetWidth - 4) + 'px';
		drawChart();
	}
	function hideTip() { hoverX = null; $('pg-tip').hidden = true; drawChart(); }
	box.addEventListener('pointermove', function (e) { tip(e.clientX); });
	box.addEventListener('pointerdown', function (e) { tip(e.clientX); });
	box.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') hideTip(); });
	if (window.ResizeObserver) new ResizeObserver(function () { drawChart(); }).observe(box); else window.addEventListener('resize', drawChart);
	function panels() {
		if (!window.MESPanel) { if (document.readyState !== 'complete') return void setTimeout(panels, 200); return; }
		window.MESPanel.add($('pg-chartsec'), { bar: $('pg-cbtns'), onChange: function () { setTimeout(drawChart, 30); } });
		window.MESPanel.add($('pg-logsec'), { bar: $('pg-logsec').querySelector('.pg-chead'), onChange: scrollLog });
	}
	panels();

	/* ---------- render loop ---------- */
	var dirty = true;
	function renderAll() { renderTable(); renderVerdicts(); drawChart(); }
	setInterval(function () { if (dirty || running) { dirty = false; renderTable(); renderVerdicts(); if (hoverX == null) drawChart(); } }, 500);
	if (window.MutationObserver) new MutationObserver(function () { drawChart(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
	window.addEventListener('pagehide', function () { Object.keys(R).forEach(function (id) { if (R[id].timer) clearInterval(R[id].timer); }); });

	drawTargets(); spanChips(); paintGo(); status(); renderAll();
	if (/[?&]start=1/.test(location.search)) start();
})();
