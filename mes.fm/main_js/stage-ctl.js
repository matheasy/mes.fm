/* MES stage controls: a small "View" bar above every simulation box (Small / Medium / Large, a corner grip to drag any size, and "Fill window"), shared by the simulator pages.
   - Size: the box (.xx-wrap, xx = fl lm bh mb pe ss ac mm ftl) gets a max-width; the simulators already lay out from their box's width, so they follow (a window "resize" is also fired).
   - Fill window: the box covers the whole browser window (not the screen: the browser's own full screen stays on the existing button) with its stage as large as the window allows. Esc or the Close button leaves it.
   The choice is remembered per page (localStorage mes-stage:<path>). On a giant monitor the default is Medium (900 px), not the whole column. */
(function () {
	'use strict';
	if (window.MESStage) return;
	var PREFIX = ['fl', 'lm', 'bh', 'mb', 'mt', 'or', 'dp', 'em', 'pe', 'ss', 'ac', 'mm', 'ftl'];
	var KEY = 'mes-stage:' + location.pathname;
	var SIZES = [['S', 'Small', 640, 380], ['M', 'Medium', 900, 600], ['L', 'Large', 0, 0]];   // [id, name, max width px (0 = the whole column), max stage height px (0 = none)]: a square scenario gets a narrower box so it is not a giant square
	function read() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
	function write(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } }
	var NOCAP = /(^|\s)ftl-wrap(\s|$)/;   // boxes whose stage height is not a fixed fraction of its width (it follows the scene), so a width cap derived from the aspect would feed back and flicker
	var state = read(), wraps = [], filling = null, backdrop = null, closeBtn = null;

	var css = '.mes-sbar{display:flex;flex-wrap:wrap;gap:0.3em;align-items:center;justify-content:flex-end;margin:0 auto 0.35em;font-size:0.8em;color:#667}' +
		'.mes-sbar .mes-sl{margin-right:0.3em;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;font-size:0.85em}' +
		'.mes-sbar button{cursor:pointer;font:inherit;padding:0.2em 0.7em;border-radius:0.35em;border:1px solid #c9d2dc;background:#f4f7fa;color:#223}' +
		'.mes-sbar button:hover{border-color:var(--accent,#277bb6)}.mes-sbar button[aria-pressed="true"]{background:var(--accent,#277bb6);border-color:var(--accent,#277bb6);color:#fff}' +
		'.mes-grip{position:absolute;right:0;bottom:0;width:20px;height:20px;cursor:nwse-resize;z-index:30;touch-action:none;opacity:0.65;background:linear-gradient(135deg,transparent 0 52%,rgba(255,255,255,0.75) 52% 58%,transparent 58% 70%,rgba(255,255,255,0.75) 70% 76%,transparent 76%)}' +
		'.mes-grip:hover{opacity:1}' +
		'html.mes-fill-on{overflow:hidden !important}' +
		'.mes-fill-bd{position:fixed;inset:0;background:#05070d;z-index:2147482000}' +
		'.mes-fill{position:fixed !important;left:50%;top:0;transform:translateX(-50%);z-index:2147482500;max-width:none !important;width:var(--mes-fw,100vw) !important;height:100vh;margin:0 !important;border-radius:0 !important;border:0 !important;overflow:auto;display:flex !important;flex-direction:column;justify-content:center}' +
		'.mes-fill-x{position:fixed;right:0.8em;top:0.7em;z-index:2147483000;cursor:pointer;font:inherit;font-size:0.85em;padding:0.35em 0.9em;border-radius:0.4em;border:1px solid #3a4258;background:rgba(10,13,20,0.9);color:#e8ecf5}' +
		'body.dark-mode .mes-sbar{color:#a0a8b3}body.dark-mode .mes-sbar button{background:#2b2f36;border-color:#454c58;color:#e6e8ec}body.dark-mode .mes-sbar button[aria-pressed="true"]{background:var(--accent,#277bb6);color:#fff}';
	var st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);

	function colW(w) { var p = w.parentNode; return p ? p.clientWidth || 0 : 0; }
	function curSize() { if (state.w) return 'C'; if (state.s) return state.s; return (window.innerWidth >= 1250) ? 'M' : 'L'; }
	function isFree(w) { return w.getAttribute('data-mes-free') === '1'; }   // a simulation that lays itself out for any width x height (it calls MESStage.sh for its stage height)
	function heightFor(wrapEl) {   // the stage height the user asked for (px), 0 = the simulation's own shape
		if (!isFree(wrapEl) || wrapEl.classList.contains('mes-fill')) return [0, 0];
		var s = curSize(); if (s === 'C') return state.h ? [state.h, 1] : [0, 0];   // [px, exact?]: an exact height is used as it is, a preset's is only a cap
		for (var i = 0; i < SIZES.length; i++) if (SIZES[i][0] === s) return [SIZES[i][3] || 0, 0];
		return [0, 0];
	}
	function target(wrapEl) {   // px width for the current choice (0 = no cap)
		var s = curSize(), col = colW(wrapEl);
		if (s === 'C') {
			var cw = Math.max(380, Math.min(col || 1e5, state.w));
			if (state.h && !isFree(wrapEl)) {   // a fixed-shape picture: the box is the largest one of its own shape that fits inside the chosen width x height
				var asp0 = wrapEl.__asp || 0; if (!asp0) { var st0 = wrapEl.querySelector('[class$="-stage"]'); if (st0 && st0.offsetWidth > 0 && st0.offsetHeight > 0) asp0 = st0.offsetWidth / st0.offsetHeight; }
				if (asp0) cw = Math.max(320, Math.min(cw, Math.round(state.h * asp0)));
			}
			return cw;
		}
		for (var i = 0; i < SIZES.length; i++) if (SIZES[i][0] === s) {
			var width = SIZES[i][2] ? Math.min(SIZES[i][2], col || SIZES[i][2]) : 0, cap = NOCAP.test(wrapEl.className) ? 0 : SIZES[i][3], stage = (width || cap) ? wrapEl.querySelector('[class$="-stage"]') : null;
			if (stage && !wrapEl.__fixedH) {   // the aspect the simulation itself chose (its inline px width + height), else the settled box
				var sw = parseFloat(stage.style.width), sh = parseFloat(stage.style.height);
				if (sw > 0 && sh > 0 && stage.style.width.indexOf('%') < 0 && stage.style.height.indexOf('%') < 0) wrapEl.__asp = sw / sh;
				else if (stage.offsetWidth > 0 && stage.offsetHeight > 0) {
					var w0 = stage.offsetWidth, h0 = stage.offsetHeight, m = wrapEl.__m;
					// a stage whose height does not change when its width does (a CSS height, or a clamp) has no aspect: a width cap derived from it feeds back and shrinks the box, so it gets width caps only
					if (m && Math.abs(w0 - m.w) > 20 && Math.abs(h0 - m.h) < 4) { wrapEl.__fixedH = true; wrapEl.__asp = 0; }
					else wrapEl.__asp = w0 / h0;
					wrapEl.__m = { w: w0, h: h0 };
				}
			}
			if (wrapEl.__fixedH || wrapEl.__frozen) cap = 0;
			if (cap && wrapEl.__asp) { var byH = Math.round(cap * wrapEl.__asp); width = width ? Math.min(width, byH) : (byH < col ? byH : 0); }
			return width ? Math.max(320, width) : 0;
		}
		return 0;
	}
	function apply() {
		wraps.forEach(function (o) {
			var t = target(o.wrap), hh = heightFor(o.wrap);
			if ((o.wrap.__sh || 0) !== hh[0] || (o.wrap.__she || 0) !== hh[1]) { o.wrap.__sh = hh[0]; o.wrap.__she = hh[1]; var vn = hh[1] ? '--mes-sh' : '--mes-shmax'; o.wrap.style.removeProperty('--mes-sh'); o.wrap.style.removeProperty('--mes-shmax'); if (hh[0]) o.wrap.style.setProperty(vn, hh[0] + 'px'); ping(); }
			var cur = parseInt(o.wrap.style.maxWidth, 10) || 0;
			if (cur !== t) { var now = Date.now(); o.ch = (o.ch || []).filter(function (x) { return now - x < 3000; }); o.ch.push(now); if (o.ch.length > 6 && !o.wrap.__frozen) { o.wrap.__frozen = true; t = target(o.wrap); }   // safety net: a box that keeps changing size is frozen on width-only caps
				o.wrap.style.maxWidth = t ? t + 'px' : ''; o.wrap.style.marginLeft = o.wrap.style.marginRight = t ? 'auto' : ''; o.bar.style.maxWidth = t ? t + 'px' : ''; ping(); }
			var s = curSize();
			Array.prototype.forEach.call(o.bar.querySelectorAll('[data-s]'), function (b) { b.setAttribute('aria-pressed', b.dataset.s === s ? 'true' : 'false'); });
		});
	}
	var pt = 0;
	function ping() { clearTimeout(pt); pt = setTimeout(function () { try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ } }, 30); }

	function attach(wrap) {
		if (wrap.__mesStage) return; wrap.__mesStage = true;
		var bar = document.createElement('div'); bar.className = 'mes-sbar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Size of the simulation');
		bar.innerHTML = '<span class="mes-sl">View</span>' + SIZES.map(function (z) { return '<button type="button" data-s="' + z[0] + '" title="' + z[1] + ' simulation box">' + z[1] + '</button>'; }).join('') +
			'<button type="button" data-fill="1" title="Fill the browser window (Esc leaves)">⤢ Fill window</button>';
		wrap.parentNode.insertBefore(bar, wrap);
		var o = { wrap: wrap, bar: bar }; wraps.push(o);
		var stage0 = wrap.querySelector('[class$="-stage"]'), rt = 0;
		if (stage0 && window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(function () { if (!filling) apply(); }, 120); }).observe(stage0);
		bar.addEventListener('click', function (e) {
			var b = e.target.closest('button'); if (!b) return;
			if (b.dataset.fill) { fill(wrap); return; }
			state = { s: b.dataset.s }; write(state); apply();
		});
		var grip = document.createElement('div'); grip.className = 'mes-grip'; grip.title = 'Drag to resize the box, wider or narrower and taller or shorter (double-click: back to the standard size)'; grip.setAttribute('aria-hidden', 'true');
		if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
		wrap.appendChild(grip);
		var drag = null;
		grip.addEventListener('pointerdown', function (e) { var stg = wrap.querySelector('[class$="-stage"]'); drag = { x: e.clientX, y: e.clientY, w: wrap.offsetWidth, h: stg ? stg.offsetHeight : 0 }; try { grip.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } e.preventDefault(); });
		grip.addEventListener('pointermove', function (e) {
			if (!drag) return;
			var col = colW(wrap) || 1e5, w = Math.max(380, Math.min(col, Math.round(drag.w + 2 * (e.clientX - drag.x))));
			var h = drag.h ? Math.max(200, Math.min(1800, Math.round(drag.h + (e.clientY - drag.y)))) : 0;
			state = h ? { w: w, h: h } : { w: w }; apply();
		});
		function up() { if (drag) { drag = null; write(state); } }
		grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
		grip.addEventListener('dblclick', function () { state = {}; write(state); apply(); });
		apply();
	}

	/* ----- fill the browser window ----- */
	function fillWidth(wrap) {
		var stage = wrap.querySelector('[class$="-stage"]') || wrap.firstElementChild, aspect = 16 / 9;
		if (wrap.__aspect) aspect = wrap.__aspect;
		else if (stage && stage.offsetWidth > 0 && stage.offsetHeight > 0) aspect = wrap.__aspect = stage.offsetWidth / stage.offsetHeight;
		var extra = wrap.__extra != null ? wrap.__extra : (wrap.__extra = Math.max(0, wrap.offsetHeight - (stage ? stage.offsetHeight : 0)));
		return Math.max(320, Math.min(window.innerWidth, Math.round((window.innerHeight - extra - 4) * aspect)));
	}
	function fill(wrap) {
		if (filling) return;
		wrap.__aspect = null; wrap.__extra = null; fillWidth(wrap);   // measure before the class changes the layout
		filling = wrap;
		backdrop = document.createElement('div'); backdrop.className = 'mes-fill-bd'; document.body.appendChild(backdrop);
		closeBtn = document.createElement('button'); closeBtn.type = 'button'; closeBtn.className = 'mes-fill-x'; closeBtn.textContent = '✕ Close (Esc)'; closeBtn.onclick = leave; document.body.appendChild(closeBtn);
		wrap.style.setProperty('--mes-fw', fillWidth(wrap) + 'px'); wrap.classList.add('mes-fill'); document.documentElement.classList.add('mes-fill-on');
		ping(); setTimeout(ping, 150);
	}
	function leave() {
		if (!filling) return;
		filling.classList.remove('mes-fill'); filling.style.removeProperty('--mes-fw'); document.documentElement.classList.remove('mes-fill-on');
		if (backdrop) backdrop.remove(); if (closeBtn) closeBtn.remove(); backdrop = closeBtn = null; filling = null;
		ping(); setTimeout(ping, 150);
	}
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && filling && !document.fullscreenElement) leave(); });
	window.addEventListener('resize', function () { if (filling) { filling.style.setProperty('--mes-fw', fillWidth(filling) + 'px'); } else apply(); });

	function init() {
		var sel = PREFIX.map(function (p) { return '.' + p + '-wrap'; }).join(',');
		Array.prototype.forEach.call(document.querySelectorAll(sel), attach);
	}
	window.MESStage = { attach: attach, apply: apply, leave: leave, sh: function (stage, h) { var w = stage && stage.parentNode, o = w && w.__sh; if (!o) return h; return w.__she ? o : Math.min(h, o); } };
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
