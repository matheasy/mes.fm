/* MES CAS UI kit, shared by /cas-calculator, /derivative-calculator and /integral-calculator (each page's own js/<slug>.js
   supplies the request builder and the result renderer). window.CASUI:
     page(cfg)            wires input + live preview + symbol chips + examples + history + share links + Run/Cancel/status
     steps(list)          step tree -> HTML (titles / text may hold \( inline \) maths; tex lines are display maths)
     m(tex) / mi(tex)     display / inline maths HTML
     typeset(el)          MathJax 4 (jsDelivr, loaded on first use) typesets el
     plot(canvas, p)      small function plot from engine samples: {a, b, series:[{label, data:[[x,y|null],...]}], shade, roots}
     graphLink(list)      /2d-graphing-calculator?f=..&f=..
     copy(text, msg), toast(msg), esc(s)
   Everything heavy (MathJax, Pyodide) loads on first interaction; the page works and looks right before that. */
(function () {
	'use strict';
	var $ = function (id) { return document.getElementById(id); };
	function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
	function m(t) { return '<div class="cs-math">\\[' + esc(t) + '\\]</div>'; }
	function mi(t) { return '\\(' + esc(t) + '\\)'; }
	function ml(t) { return '<div class="cs-math cs-math--l">\\(\\displaystyle ' + esc(t) + '\\)</div>'; }   // left-aligned, no display margins

	/* ---------- MathJax 4, configured like mes.fm/hutchison-nancy-physics-system ---------- */
	var mjP = null;
	function mathjax() {
		if (mjP) return mjP;
		mjP = new Promise(function (res, rej) {
			if (window.MathJax && window.MathJax.typesetPromise) { res(); return; }
			window.MathJax = {
				tex: { inlineMath: [['\\(', '\\)']], displayMath: [['\\[', '\\]']], processEscapes: true },
				options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'input', 'select', 'button'] },
				chtml: { displayOverflow: 'linebreak', linebreaks: { inline: true } },
				startup: { typeset: false, ready: function () { window.MathJax.startup.defaultReady(); window.MathJax.startup.promise.then(res, rej); } }
			};
			var s = document.createElement('script');
			s.src = 'https://cdn.jsdelivr.net/npm/mathjax@4/tex-mml-chtml.js';
			s.async = true;
			s.onerror = function () { mjP = null; rej(new Error('mathjax')); };
			document.head.appendChild(s);
		});
		return mjP;
	}
	var tsChain = Promise.resolve();
	function typeset(el) {
		tsChain = tsChain.then(function () {
			return mathjax().then(function () {
				if (window.MathJax.typesetClear) window.MathJax.typesetClear([el]);
				return window.MathJax.typesetPromise([el]);
			});
		}).catch(function () { el.classList.add('cs-nomj'); });
		return tsChain;
	}

	/* ---------- steps ---------- */
	function steps(list, depth) {
		if (!list || !list.length) return '';
		depth = depth || 0;
		return '<ol class="cs-steps' + (depth ? ' cs-steps--sub' : '') + '">' + list.map(function (s) {
			return '<li class="cs-step"><div class="cs-step__h">' + esc(s.title) + '</div>' +
				(s.text ? '<p class="cs-step__t">' + esc(s.text) + '</p>' : '') +
				(s.tex || []).map(m).join('') + steps(s.children, depth + 1) + '</li>';
		}).join('') + '</ol>';
	}

	/* ---------- toast / copy ---------- */
	var toastEl = null, toastT;
	function toast(msg) {
		if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'tu-toast'; toastEl.setAttribute('role', 'status'); (document.querySelector('.tu') || document.body).appendChild(toastEl); }
		toastEl.textContent = msg; toastEl.classList.add('tu-toast--show'); clearTimeout(toastT);
		toastT = setTimeout(function () { toastEl.classList.remove('tu-toast--show'); }, 1600);
	}
	function copy(text, msg) {
		function done() { toast(msg || 'Copied'); }
		function fallback() {
			var ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta);
			ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('Copy failed'); } document.body.removeChild(ta);
		}
		if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
	}

	/* ---------- plot ---------- */
	function niceStep(span, n) {
		var raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
		return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
	}
	function fmtTick(v, step) { var d = Math.max(0, -Math.floor(Math.log10(step) + 1e-9)); return Math.abs(v) < step / 1e6 ? '0' : v.toFixed(Math.min(d, 6)); }
	function plot(cv, p) {
		if (!cv || !p) return;
		cv._plot = p;
		var dark = document.body.classList.contains('dark-mode');
		var accent = getComputedStyle(cv.closest('.tu') || document.body).getPropertyValue('--accent').trim() || '#c026d3';
		var W = cv.clientWidth || 600, H = Math.round(Math.min(340, Math.max(220, W * 0.55))), dpr = window.devicePixelRatio || 1;
		cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.height = H + 'px';
		var g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
		var a = p.a, b = p.b, ys = [];
		p.series.forEach(function (s) { s.data.forEach(function (pt) { if (pt[1] != null && isFinite(pt[1])) ys.push(pt[1]); }); });
		ys.sort(function (u, v) { return u - v; });
		var lo = ys.length ? ys[Math.floor(ys.length * 0.03)] : -1, hi = ys.length ? ys[Math.min(ys.length - 1, Math.floor(ys.length * 0.97))] : 1;
		if (p.roots && p.roots.length) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
		if (lo > 0 && lo < (hi - lo) * 0.6) lo = 0;
		if (hi < 0 && -hi < (hi - lo) * 0.6) hi = 0;
		if (!(hi > lo)) { lo -= 1; hi += 1; }
		var pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
		var L = 8, R = W - 8, T = 8, B = H - 22;
		var X = function (x) { return L + (x - a) / (b - a) * (R - L); }, Y = function (y) { return B - (y - lo) / (hi - lo) * (B - T); };
		var grid = dark ? '#3a3f47' : '#e6e9ee', axis = dark ? '#9aa3ad' : '#55606d', txt = dark ? '#c9d0d8' : '#55606d', fcol = dark ? '#e8ecf1' : '#1e2733';
		g.font = '11px system-ui, sans-serif'; g.lineWidth = 1;
		var sx = niceStep(b - a, Math.max(4, Math.round(W / 90))), sy = niceStep(hi - lo, Math.max(3, Math.round(H / 60)));
		g.strokeStyle = grid; g.fillStyle = txt; g.textAlign = 'center';
		for (var gx = Math.ceil(a / sx) * sx; gx <= b + 1e-9; gx += sx) { g.beginPath(); g.moveTo(X(gx), T); g.lineTo(X(gx), B); g.stroke(); g.fillText(fmtTick(gx, sx), X(gx), H - 7); }
		g.textAlign = 'left';
		for (var gy = Math.ceil(lo / sy) * sy; gy <= hi + 1e-9; gy += sy) { g.beginPath(); g.moveTo(L, Y(gy)); g.lineTo(R, Y(gy)); g.stroke(); if (Y(gy) > T + 8 && Y(gy) < B - 4) g.fillText(fmtTick(gy, sy), L + 3, Y(gy) - 3); }
		g.strokeStyle = axis; g.lineWidth = 1.3;
		if (lo < 0 && hi > 0) { g.beginPath(); g.moveTo(L, Y(0)); g.lineTo(R, Y(0)); g.stroke(); }
		if (a < 0 && b > 0) { g.beginPath(); g.moveTo(X(0), T); g.lineTo(X(0), B); g.stroke(); }
		var cols = [fcol, accent, '#2f7d32', '#c2500e'];
		if (p.shade && p.series[0]) {
			var d0 = p.series[0].data, s0 = p.shade[0], s1 = p.shade[1];
			g.fillStyle = dark ? 'rgba(255,190,90,0.28)' : 'rgba(180,83,9,0.22)';
			if (accent) { g.fillStyle = accent; g.globalAlpha = dark ? 0.32 : 0.22; }
			var open = false;
			g.beginPath();
			d0.forEach(function (pt) {
				if (pt[0] < s0 - 1e-9 || pt[0] > s1 + 1e-9 || pt[1] == null) { if (open) { g.lineTo(X(lastX), Y(0)); g.closePath(); open = false; } return; }
				var yy = Math.max(lo, Math.min(hi, pt[1]));
				if (!open) { g.moveTo(X(pt[0]), Y(0)); open = true; }
				g.lineTo(X(pt[0]), Y(yy)); lastX = pt[0];
			});
			var lastX;
			if (open) { g.lineTo(X(lastX), Y(0)); g.closePath(); }
			g.fill(); g.globalAlpha = 1;
			g.strokeStyle = accent; g.setLineDash([4, 3]);
			[s0, s1].forEach(function (sv) { if (sv >= a && sv <= b) { g.beginPath(); g.moveTo(X(sv), T); g.lineTo(X(sv), B); g.stroke(); } });
			g.setLineDash([]);
		}
		p.series.forEach(function (s, i) {
			g.strokeStyle = s.color || cols[i % cols.length]; g.lineWidth = i ? 2.2 : 2; g.beginPath();
			var pen = false, prev = null, jump = (hi - lo) * 1.5;
			s.data.forEach(function (pt) {
				var y = pt[1];
				if (y == null || !isFinite(y) || (prev != null && Math.abs(y - prev) > jump)) { pen = false; prev = y == null ? null : y; if (y == null) return; }
				var yy = Math.max(lo - (hi - lo), Math.min(hi + (hi - lo), y));
				if (!pen) { g.moveTo(X(pt[0]), Y(yy)); pen = true; } else g.lineTo(X(pt[0]), Y(yy));
				prev = y;
			});
			g.stroke();
		});
		(p.roots || []).forEach(function (r) {
			if (r < a || r > b) return;
			g.fillStyle = accent; g.strokeStyle = dark ? '#111' : '#fff'; g.lineWidth = 2;
			g.beginPath(); g.arc(X(r), Y(0), 5, 0, 2 * Math.PI); g.fill(); g.stroke();
		});
	}
	function replot() { Array.prototype.forEach.call(document.querySelectorAll('canvas.cs-plot'), function (c) { if (c._plot && c.offsetParent) plot(c, c._plot); }); }
	var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(replot, 120); });
	if (window.MutationObserver) new MutationObserver(function () { replot(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

	function graphLink(list) { return '/2d-graphing-calculator?' + list.map(function (f) { return 'f=' + encodeURIComponent(f); }).join('&'); }

	/* ---------- input helpers ---------- */
	function insertAt(input, s) {
		var a = input.selectionStart == null ? input.value.length : input.selectionStart, b = input.selectionEnd == null ? a : input.selectionEnd;
		var sel = input.value.slice(a, b), ins = s;
		if (/\($/.test(s)) ins = s + sel + ')';               // wrap a selection: sqrt( + x -> sqrt(x)
		input.value = input.value.slice(0, a) + ins + input.value.slice(b);
		var caret = a + (/\($/.test(s) ? s.length + sel.length + (sel ? 1 : 0) : ins.length);
		try { input.setSelectionRange(caret, caret); } catch (e) {}
		input.dispatchEvent(new Event('input', { bubbles: true }));
		if (!window.matchMedia('(pointer: coarse)').matches) input.focus();
	}

	/* ---------- page wiring ---------- */
	var STAGES = { runtime: 'Downloading the Python runtime', packages: 'Loading SymPy and mpmath', engine: 'Loading the MES engine', warm: 'Warming up', ready: 'Ready' };
	function page(cfg) {
		var input = cfg.input, prev = cfg.preview, out = cfg.out, status = cfg.status, go = cfg.go;
		var KEY = cfg.key, state = { hist: [] };
		try { var sv = JSON.parse(localStorage.getItem(KEY) || 'null'); if (sv && sv.hist) state.hist = sv.hist.slice(0, 30); } catch (e) {}
		function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {} }
		var running = false, lastReq = null;

		// status line: engine download progress, then "Working..." + Cancel
		status.innerHTML = '<div class="cs-status__row"><span class="cs-spin" aria-hidden="true"></span><span class="cs-status__msg"></span>' +
			'<button type="button" class="tu-btn tu-btn--ghost cs-cancel">Cancel</button></div><div class="cs-bar"><span></span></div>';
		var msgEl = status.querySelector('.cs-status__msg'), bar = status.querySelector('.cs-bar span'), cancelBtn = status.querySelector('.cs-cancel');
		cancelBtn.addEventListener('click', function () { MESCAS.cancel(); });
		function showStatus(msg, pct, cancel) {
			status.hidden = false; msgEl.textContent = msg;
			status.classList.toggle('has-bar', pct != null); bar.style.width = (pct || 0) + '%';
			cancelBtn.hidden = !cancel;
		}
		function hideStatus() { status.hidden = true; }
		MESCAS.onStatus(function (s) {
			if (s.state === 'loading') showStatus('Loading the math engine (first use only, ~10 MB, cached afterwards): ' + (STAGES[s.stage] || s.stage) + '…', s.pct, running);
			else if (s.state === 'ready' && running) showStatus('Working…', null, true);
			else if (s.state === 'ready' && !running) hideStatus();
			else if (s.state === 'failed') hideStatus();
			if (s.state === 'ready') schedulePreview();
		});

		function error(msg) { out.hidden = false; out.innerHTML = '<div class="cs-error" role="alert">' + esc(msg) + '</div>'; }
		function params() { return cfg.params ? cfg.params() : {}; }

		// live preview: plain echo until the engine is up, then SymPy's own reading as LaTeX
		var pt, pseq = 0;
		function schedulePreview() { clearTimeout(pt); pt = setTimeout(preview, 280); }
		function preview() {
			var text = input.value.trim();
			if (!text) { prev.innerHTML = '<span class="cs-preview__hint">' + esc(cfg.hint || 'Your input will be shown here as maths.') + '</span>'; prev.className = 'cs-preview is-dim'; return; }
			if (MESCAS.state() !== 'ready' || MESCAS.busy()) {
				prev.className = 'cs-preview is-echo'; prev.innerHTML = '<span class="cs-preview__lbl">You typed</span> <code>' + esc(text) + '</code>';
				return;
			}
			var my = ++pseq, req = { op: 'parse', expr: text, mode: cfg.previewMode ? cfg.previewMode() : '' };
			var pv = params(); if (pv.var) req.var = pv.var;
			MESCAS.call(req, { timeout: 6000 }).then(function (r) {
				if (my !== pseq) return;
				if (!r.ok) { prev.className = 'cs-preview is-err'; prev.textContent = r.error; return; }
				if (r.empty || !r.latex) { prev.className = 'cs-preview is-dim'; prev.innerHTML = ''; return; }
				prev.className = 'cs-preview'; prev.innerHTML = '<span class="cs-preview__lbl">I read</span>' + m((cfg.previewPrefix ? cfg.previewPrefix(r) : '') + r.latex);
				typeset(prev);
			}, function () {});
		}
		input.addEventListener('input', function () {
			if (MESCAS.state() === 'idle' && input.value.trim()) MESCAS.start().catch(function () {});   // typing starts the download
			schedulePreview();
		});
		input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); run(); } });

		if (cfg.chips) {
			cfg.chips.addEventListener('mousedown', function (e) { if (e.target.closest('button')) e.preventDefault(); });
			cfg.chips.addEventListener('click', function (e) { var b = e.target.closest('button[data-ins]'); if (b) insertAt(input, b.dataset.ins); });
		}
		if (cfg.examples) cfg.examples.addEventListener('change', function () {
			var o = cfg.examples.options[cfg.examples.selectedIndex]; if (!o || !o.value) return;
			input.value = o.value;
			var p = {}; try { p = JSON.parse(o.getAttribute('data-p') || '{}'); } catch (e) {}
			if (cfg.setParams) cfg.setParams(p, true);
			cfg.examples.selectedIndex = 0;
			run();
		});

		function shareUrl() {
			var q = new URLSearchParams(), text = input.value.trim();
			if (text) q.set('q', text);
			var p = params(); Object.keys(p).forEach(function (k) { if (p[k] !== '' && p[k] != null && p[k] !== false) q.set(k, p[k] === true ? '1' : p[k]); });
			var s = q.toString(); return location.origin + location.pathname + (s ? '?' + s : '');
		}

		function renderHist() {
			if (!cfg.histList) return;
			cfg.histCard.hidden = !state.hist.length;
			cfg.histList.innerHTML = state.hist.map(function (h, i) {
				return '<li data-i="' + i + '" title="Click to run again"><span class="cs-h-q">' + esc(h.q) + '</span>' + (h.r ? '<span class="cs-h-r">' + esc(h.r) + '</span>' : '') + '</li>';
			}).join('');
		}
		if (cfg.histList) {
			cfg.histList.addEventListener('click', function (e) {
				var li = e.target.closest('li'); if (!li) return; var h = state.hist[+li.dataset.i]; if (!h) return;
				input.value = h.q; if (cfg.setParams) cfg.setParams(h.p || {}, true); run();
			});
			cfg.histClear.addEventListener('click', function () { state.hist = []; save(); renderHist(); });
			renderHist();
		}
		function addHist(q, p, r) {
			state.hist = state.hist.filter(function (h) { return !(h.q === q && JSON.stringify(h.p || {}) === JSON.stringify(p)); });
			state.hist.unshift({ q: q, p: p, r: (r || '').slice(0, 80) }); state.hist = state.hist.slice(0, 30); save(); renderHist();
		}

		function run() {
			var text = input.value.trim();
			if (!text) { error(cfg.emptyMsg || 'Type something first.'); input.focus(); return; }
			if (running) return;
			var p = params(), req = cfg.request(text, p);
			if (!req) return;
			running = true; lastReq = req; go.disabled = true;
			var gotPartial = false;
			showStatus(MESCAS.state() === 'ready' ? 'Working…' : 'Loading the math engine (first use only, ~10 MB, cached afterwards)…', MESCAS.state() === 'ready' ? null : (MESCAS.info().pct || 2), true);
			var t0 = performance.now();
			MESCAS.call(req, {
				timeout: cfg.timeout || 25000,
				onPartial: function (part) {
					if (!cfg.renderPartial) return;
					var html = cfg.renderPartial(part, req); if (!html) return;
					gotPartial = true; out.hidden = false; out.innerHTML = html; after(out);
				}
			}).then(function (r) {
				running = false; go.disabled = false; hideStatus(); schedulePreview();
				if (!r.ok) { error(r.error); return; }
				out.hidden = false; out.innerHTML = cfg.render(r, req);
				after(out);
				if (cfg.onTiming) cfg.onTiming(performance.now() - t0);
				addHist(text, p, cfg.label ? cfg.label(r) : (r.plain || ''));
				try { history.replaceState(null, '', shareUrl()); } catch (e) {}
			}, function (err) {
				running = false; go.disabled = false; hideStatus(); schedulePreview();
				if (err.code === 'cancel') { if (!gotPartial) error('Cancelled.'); else toast('Stopped'); return; }
				if (err.code === 'timeout') {
					if (gotPartial) { var n = out.querySelector('.cs-pending'); if (n) n.textContent = 'The search for exact forms was stopped after ' + Math.round((cfg.timeout || 25000) / 1000) + ' s; the numeric answers above are complete.'; return; }
					error('That took longer than ' + Math.round((cfg.timeout || 25000) / 1000) + ' seconds, so it was stopped. SymPy may not be able to do this one -- try a simpler form, or split it up.'); return;
				}
				error(err.message || 'Something went wrong.');
			});
		}
		function after(el) {
			typeset(el);
			Array.prototype.forEach.call(el.querySelectorAll('canvas.cs-plot'), function (c) { if (c._pending) { plot(c, c._pending); delete c._pending; } });
			Array.prototype.forEach.call(el.querySelectorAll('[data-copy]'), function (b) {
				b.addEventListener('click', function () {
					var k = b.getAttribute('data-copy');
					if (k === 'link') copy(shareUrl(), 'Link copied'); else copy(b.getAttribute('data-text'), k === 'latex' ? 'LaTeX copied' : 'Answer copied');
				});
			});
			if (cfg.afterRender) cfg.afterRender(el);
		}
		go.addEventListener('click', run);

		// shared links: ?q=...&var=... runs straight away
		var qs = new URLSearchParams(location.search);
		if (qs.get('q')) {
			input.value = qs.get('q').slice(0, 600);
			var p0 = {}; qs.forEach(function (v, k) { if (k !== 'q') p0[k] = v; });
			if (cfg.setParams) cfg.setParams(p0, false);
			run();
		} else schedulePreview();
		return { run: run, shareUrl: shareUrl, input: input };
	}

	/* a canvas placeholder the renderer fills after the HTML is in the page */
	var pc = 0;
	function plotHtml(p, legend) {
		var id = 'cs-plot-' + (++pc);
		setTimeout(function () { var c = $(id); if (c) plot(c, p); }, 0);
		return '<div class="cs-plotwrap"><canvas class="cs-plot" id="' + id + '" aria-label="Plot"></canvas>' + (legend ? '<div class="cs-legend">' + legend + '</div>' : '') + '</div>';
	}
	function buttons(r, latex) {
		var h = '<div class="cs-btns">';
		if (r.plain) h += '<button type="button" class="tu-btn tu-btn--ghost" data-copy="answer" data-text="' + esc(r.plain) + '">Copy answer</button>';
		if (latex) h += '<button type="button" class="tu-btn tu-btn--ghost" data-copy="latex" data-text="' + esc(latex) + '">Copy LaTeX</button>';
		h += '<button type="button" class="tu-btn tu-btn--ghost" data-copy="link">Copy link</button></div>';
		return h;
	}

	window.CASUI = { page: page, steps: steps, m: m, mi: mi, ml: ml, esc: esc, typeset: typeset, mathjax: mathjax, plot: plot, plotHtml: plotHtml,
		graphLink: graphLink, copy: copy, toast: toast, buttons: buttons, insertAt: insertAt };
})();
