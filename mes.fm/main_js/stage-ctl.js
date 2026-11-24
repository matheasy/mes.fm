/* MES stage controls: a small "View" bar above every simulation box (Small / Medium / Large, a corner grip to drag any size, and "Fill window"), shared by the simulator pages.
   - Size: the box (.xx-wrap, xx = fl lm bh mb pe ss ac mm ftl) gets a max-width; the simulators already lay out from their box's width, so they follow (a window "resize" is also fired).
   - Fill window: the box covers the whole browser window (not the screen: the browser's own full screen stays on the existing button) with its stage as large as the window allows. Esc or the Close button leaves it.
   The choice is remembered per page (localStorage mes-stage:<path>). On a giant monitor the default is Medium (900 px), not the whole column. */
(function () {
	'use strict';
	if (window.MESStage) return;
	var PREFIX = ['fl', 'lm', 'bh', 'mb', 'bb', 'mt', 'or', 'dp', 'em', 'pe', 'ss', 'ac', 'mm', 'ftl', 'td', 'hx', 'hs', 'nr', 'ni', 'sn', 'hg', 'mv','sw', 'sh', 'qn', 'cr', 'qm', 'gy'];
	var KEY = 'mes-stage:' + location.pathname;
	var SIZES = [['S', 'Small', 640, 380], ['M', 'Medium', 900, 600], ['L', 'Large', 0, 0]];   // [id, name, max width px (0 = the whole column), max stage height px (0 = none)]: a square scenario gets a narrower box so it is not a giant square
	function read() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
	function write(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } }
	var NOCAP = /(^|\s)ftl-wrap(\s|$)/;   // boxes whose stage height is not a fixed fraction of its width (it follows the scene), so a width cap derived from the aspect would feed back and flicker
	var state = read(), wraps = [], filling = null, backdrop = null, closeBtn = null;

	var css = '.mes-sbar{display:flex;flex-wrap:wrap;gap:0.3em;align-items:center;justify-content:flex-end;margin:0 auto 0.35em;font-size:0.8em;color:#667}' +
		'.mes-sbar .mes-sl{margin-right:0.3em;text-transform:uppercase;letter-spacing:0.05em;font-weight:700;font-size:0.85em}' +
		'.mes-sbar button{cursor:pointer;font:inherit;padding:0.2em 0.7em;border-radius:0.35em;border:1px solid #c9d2dc;background:#f4f7fa;color:#223}' +
		'.mes-sbar button[data-fill]{font-weight:700;border-color:#1d6fd1;color:#1559ad;background:#eef5fd}body.dark-mode .mes-sbar button[data-fill]:not([aria-pressed="true"]){border-color:#6ea8fe;color:#9cc4ff;background:#1d2733}' +   /* 2026-11-24: make Fill window easy to spot */
		'.mes-sbar button:hover{border-color:var(--accent,#277bb6)}.mes-sbar button[aria-pressed="true"]{background:var(--accent,#277bb6);border-color:var(--accent,#277bb6);color:#fff}' +
		'.mes-grip{position:absolute;right:0;bottom:0;width:20px;height:20px;cursor:nwse-resize;z-index:30;touch-action:none;opacity:0.65;background:linear-gradient(135deg,transparent 0 52%,rgba(255,255,255,0.75) 52% 58%,transparent 58% 70%,rgba(255,255,255,0.75) 70% 76%,transparent 76%)}' +
		'.mes-grip:hover{opacity:1}' +
		'@media (max-width:700px){.mes-sbar button[data-s],.mes-sbar .mes-sl{display:none}.mes-sbar button{min-height:36px;padding:0.3em 0.9em}.tu .tu-chip,.tu .tu-tool,.tu .tu-run{min-height:36px}}' +
		'@media (pointer:coarse){.mes-grip{width:32px;height:32px}}' +
		'@media (max-width:700px),(pointer:coarse){.tu button:not(.mes-grip),.tu summary{min-height:36px}.tu summary{display:list-item}.tu .xx-chips button,.tu [role=group] button{padding-top:0.35em;padding-bottom:0.35em}}' +   /* phone-sized tap targets for every simulator's own buttons / chips */
		'html.mes-fill-on{overflow:hidden !important}' +
		'.mes-fill-bd{position:fixed;inset:0;background:#05070d;z-index:2147482000}' +
		'.mes-fill{position:fixed !important;left:50%;top:34px;transform:translateX(-50%);z-index:2147482500;max-width:none !important;width:var(--mes-fw,100vw) !important;height:calc(100vh - 34px);height:calc(100dvh - 34px);margin:0 !important;border-radius:0 !important;border:0 !important;overflow:auto;display:flex !important;flex-direction:column;justify-content:center}' +
		'.mes-fs{padding-top:34px !important;box-sizing:border-box;overflow:auto}' +
		'.mes-top{position:fixed;left:0;right:0;top:0;height:34px;z-index:2147483000;display:flex;align-items:center;justify-content:flex-end;gap:0.5em;padding:0 0.6em;background:#0a0d14;border-bottom:1px solid #2a3040;box-sizing:border-box}.mes-top--in{position:absolute}' +
		'.mes-top button{cursor:pointer;font:inherit;font-size:0.85em;padding:0.25em 0.9em;border-radius:0.4em;border:1px solid #3a4258;background:#151a28;color:#e8ecf5;min-height:26px}.mes-top button:hover{border-color:var(--accent,#7fd0ff)}.mes-top button{white-space:nowrap}@media (max-width:520px){.mes-top .mes-tt{display:none}}.mes-top .mes-tt{margin-right:auto;color:#9aa5bb;font-size:0.8em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
		'.mes-nopanel > :not([class$="-stage"]):not(.mes-fstage):not(.mes-grip):not(.mes-top):not(.td-run):not(.ss-transport){display:none !important}.mes-nopanel .td-ctl{display:none !important}' +
		'.mes-fside{display:grid !important;grid-template-columns:minmax(0,1fr) var(--mes-pw,280px);grid-template-rows:repeat(40,min-content) 1fr;column-gap:10px;row-gap:0;align-content:start;justify-content:stretch}' +
		'.mes-fside>*{grid-column:2;min-width:0;max-width:100%;box-sizing:border-box}.mes-fside>*:not([class$="-stage"]):not(.mes-fstage) canvas,.mes-fside>*:not([class$="-stage"]):not(.mes-fstage) svg{max-width:100%}' +
		'.mes-fside>:is([class$="-stage"],.mes-fstage){grid-column:1;grid-row:1/-1;align-self:start;position:sticky;top:0;margin:0 auto !important}.mes-fside>.mes-grip{display:none !important}' +
		'.mes-fside.mes-fill{justify-content:stretch}' +
		'.mes-fill-x{position:fixed;right:0.8em;top:0.7em;z-index:2147483000;cursor:pointer;font:inherit;font-size:0.85em;padding:0.35em 0.9em;border-radius:0.4em;border:1px solid #3a4258;background:rgba(10,13,20,0.9);color:#e8ecf5}' +
		/* controls beside the picture: the page's control cards move into a side panel (page: a flex box next to the picture; Fill window / full screen: a column inside the box) */
		'.mes-cbox{display:flex;gap:12px;align-items:flex-start;margin:0 auto}.mes-cbox.mes-cleft{flex-direction:row-reverse}.mes-cmain{flex:1 1 auto;min-width:0}' +
		'.mes-cpanel{box-sizing:border-box;border:1px solid #d5dce4;border-radius:0.6em;background:#f7f9fb;color:#223;font-size:0.95em;min-width:0}' +
		'.mes-cbox>.mes-cpanel{flex:0 0 var(--mes-pw,320px);width:var(--mes-pw,320px);max-height:var(--mes-cph,80vh);overflow:visible;position:sticky;top:66px;display:flex;flex-direction:column}.mes-cbox>.mes-cpanel>.mes-cpbody{flex:1 1 auto;min-height:0;overflow:auto}' +
		/* drag grip on the panel's inner edge (the edge touching the picture): resizes the panel */
		'.mes-cpgrip{position:absolute;top:0;bottom:0;left:-12px;width:12px;cursor:col-resize;touch-action:none;z-index:6;outline:none}.mes-cleft>.mes-cpanel>.mes-cpgrip{left:auto;right:-12px}' +
		'.mes-fside>.mes-cpanel{position:relative}.mes-fside>.mes-cpanel>.mes-cpgrip{left:-10px;width:10px}.mes-fside.mes-fleft>.mes-cpanel>.mes-cpgrip{left:auto;right:-10px}' +
		'.mes-cpgrip::before{content:"";position:absolute;top:0;bottom:0;left:50%;width:2px;margin-left:-1px;background:transparent;transition:background .15s}.mes-cpgrip::after{content:"";position:absolute;left:50%;top:min(50%,40vh);width:6px;height:44px;margin:-22px 0 0 -3px;border-radius:3px;background:#b8c2ce;transition:background .15s}' +
		'.mes-cpgrip:hover::before,.mes-cpgrip:focus-visible::before,.mes-cpgrip.is-drag::before{background:var(--accent,#277bb6)}.mes-cpgrip:hover::after,.mes-cpgrip:focus-visible::after,.mes-cpgrip.is-drag::after{background:var(--accent,#277bb6)}html.mes-cpdrag,html.mes-cpdrag *{cursor:col-resize !important;user-select:none !important}body.dark-mode .mes-cpgrip::after{background:#5a6472}' +
		'.mes-cphead{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:0.35em;padding:0.35em 0.5em;background:inherit;border-bottom:1px solid #d5dce4;border-radius:0.6em 0.6em 0 0;font-size:0.82em}' +
		'.mes-cphead b{margin-right:auto;text-transform:uppercase;letter-spacing:0.05em;font-size:0.9em;color:#556}' +
		'.mes-cphead button{cursor:pointer;font:inherit;padding:0.2em 0.65em;border-radius:0.35em;border:1px solid #c9d2dc;background:#fff;color:#223;min-height:28px}.mes-cphead button:hover{border-color:var(--accent,#277bb6)}' +
		'.mes-cpbody{padding:0.55em;overflow-x:auto}.mes-cpbody>*{margin:0 0 0.6em !important;max-width:100% !important;box-sizing:border-box}.mes-cpbody>*:last-child{margin-bottom:0 !important}' +
		'.mes-cpbody canvas,.mes-cpbody svg,.mes-cpbody img{max-width:100%}.mes-cpbody fieldset{min-width:0}.mes-cpbody :is(div,p,fieldset,[role=group]){flex-wrap:wrap}.mes-cpbody table{max-width:100%}.mes-cpbody :is(label,div,span,fieldset,select,input){min-width:0}.mes-cpbody :is(input,select,textarea){max-width:100%}' +
		'.mes-fside>.mes-cpanel{align-self:start;margin:0 0 8px}.mes-fill .mes-cpanel,.mes-fs .mes-cpanel{max-height:none}' +
		'.mes-fside.mes-fleft{grid-template-columns:var(--mes-pw,280px) minmax(0,1fr)}.mes-fside.mes-fleft>*{grid-column:1}.mes-fside.mes-fleft>:is([class$="-stage"],.mes-fstage){grid-column:2}' +
		'.mes-sbar button[data-cpb][aria-pressed="false"]{opacity:0.85}' +
		'body.dark-mode .mes-cpanel{background:#20242b;border-color:#3a414c;color:#e6e8ec}body.dark-mode .mes-cphead{border-color:#3a414c}body.dark-mode .mes-cphead b{color:#a8b0bc}body.dark-mode .mes-cphead button{background:#2b2f36;border-color:#454c58;color:#e6e8ec}' +
		'body.dark-mode .mes-sbar{color:#a0a8b3}body.dark-mode .mes-sbar button{background:#2b2f36;border-color:#454c58;color:#e6e8ec}body.dark-mode .mes-sbar button[aria-pressed="true"]{background:#1d4f7a;border-color:var(--accent,#5aa9e6);color:#fff;font-weight:600}';
	var st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);

	/* Medium and Large cannot grow past the page column, so on a page with the "More like this" sidebar beside the content they did nothing. Now a bigger box widens the page: Medium
	   asks for the Wide page, Large for Theatre (classes only: the visitor's saved page-width choice is not touched), and Small gives the width back. Only on screens wide enough for
	   the sidebar to sit beside the content (below that the box already has the full width). */
	function fitPage(s) {
		var h = document.documentElement, beside = !!document.querySelector('.has-aside, #mes-aside') && window.innerWidth >= 1360;
		var wantWide = beside && (s === 'M' || s === 'L'), wantTheatre = beside && s === 'L';
		if (wantWide && !h.classList.contains('page-wide')) { h.classList.add('page-wide'); h.__mesWide = 1; }
		else if (!wantWide && h.__mesWide) { h.classList.remove('page-wide'); h.__mesWide = 0; }
		if (wantTheatre && !h.classList.contains('page-theatre')) { h.classList.add('page-theatre'); h.__mesTheatre = 1; }
		else if (!wantTheatre && h.__mesTheatre) { h.classList.remove('page-theatre'); h.__mesTheatre = 0; }
		ping(); setTimeout(ping, 200);
	}
	function colW(w) { var cp = w.__cp; if (cp && cp.mode === 'page' && cp.box.parentNode) return Math.max(320, cp.box.parentNode.clientWidth - cpPw(cp) - 12); var p = w.parentNode; return p ? p.clientWidth || 0 : 0; }
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
			if (state.h && !isFree(wrapEl) && !NOCAP.test(wrapEl.className) && !wrapEl.__fixedH) {   // a fixed-shape picture: the box is the largest one of its own shape that fits inside the chosen width x height
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
			if (cap && wrapEl.__asp && !(isFree(wrapEl) && wrapEl.__cp && wrapEl.__cp.mode === 'page')) {   // (a free-shape picture beside the controls panel takes the width it has: its height is capped through MESStage.sh)
				 var byH = Math.round(cap * wrapEl.__asp); width = width ? Math.min(width, byH) : (byH < col ? byH : 0); }
			return width ? Math.max(320, width) : 0;
		}
		return 0;
	}
	function apply() {
		wraps.forEach(function (o) {
			var t = target(o.wrap), hh = heightFor(o.wrap);
			if ((o.wrap.__sh || 0) !== hh[0] || (o.wrap.__she || 0) !== hh[1]) { o.wrap.__sh = hh[0]; o.wrap.__she = hh[1]; var vn = hh[1] ? '--mes-sh' : '--mes-shmax'; o.wrap.style.removeProperty('--mes-sh'); o.wrap.style.removeProperty('--mes-shmax'); if (hh[0]) o.wrap.style.setProperty(vn, hh[0] + 'px'); ping(); }
			var cur = parseInt(o.wrap.style.maxWidth, 10) || 0;
			if (cur !== t) { var now = Date.now(); o.ch = (o.ch || []).filter(function (x) { return now - x < 3000; }); o.ch.push(now); if (o.ch.length > 6 && !o.wrap.__frozen && Date.now() - cpLastW > 3500) { o.wrap.__frozen = true; t = target(o.wrap); }   // safety net: a box that keeps changing size is frozen on width-only caps
				o.wrap.style.maxWidth = t ? t + 'px' : ''; o.wrap.style.marginLeft = o.wrap.style.marginRight = t ? 'auto' : ''; o.bar.style.maxWidth = t ? t + 'px' : ''; ping(); }
			var cp = o.wrap.__cp;
			if (cp && cp.mode === 'page' && cp.host === o.wrap) { var bm = t ? (t + cpPw(cp) + 12) + 'px' : ''; if (cp.box.style.maxWidth !== bm) { cp.box.style.maxWidth = bm; ping(); } }
			var s = curSize();
			Array.prototype.forEach.call(o.bar.querySelectorAll('[data-s]'), function (b) { b.setAttribute('aria-pressed', b.dataset.s === s ? 'true' : 'false'); });
		});
	}
	var pt = 0;
	function stageFloor(wrap) {   // a stage with no width of its own would shrink to nothing in the grid (auto margins): give it the column; and one that fills the box with flex (Solar System Today, photoelectric) has no height of its own inside the side-column grid: give it the window's height
		if (!wrap) return; var stg = wrap.querySelector(':scope>.mes-fstage') || wrap.querySelector('[class$="-stage"]'); if (!stg) return;
		if (wrap.classList.contains('mes-fside')) { if (!stg.style.width || stg.__mesFloorW) { stg.__mesFloorW = true; stg.style.width = '100%'; } if (stg.__mesFloor || stg.offsetHeight < 60) { stg.__mesFloor = true; stg.style.minHeight = Math.max(200, window.innerHeight - 36) + 'px'; } }
		else { if (stg.__mesFloor) { stg.__mesFloor = false; stg.style.minHeight = ''; } if (stg.__mesFloorW) { stg.__mesFloorW = false; stg.style.width = ''; } }
	}
	function ping() { clearTimeout(pt); pt = setTimeout(function () { try { layoutSide(filling); layoutSide(fsWrap); stageFloor(filling); stageFloor(fsWrap); [filling, fsWrap].forEach(function (w) { if (w && w.__paintTop) w.__paintTop(); }); } catch (e) { /* ignore */ } try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ } }, 30); }

	function attach(wrap) {
		if (wrap.__mesStage) return; wrap.__mesStage = true;
		var bar = document.createElement('div'); bar.className = 'mes-sbar'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Size of the simulation');
		bar.innerHTML = '<span class="mes-sl">View</span>' + SIZES.map(function (z) { return '<button type="button" data-s="' + z[0] + '" title="' + z[1] + ' simulation box">' + z[1] + '</button>'; }).join('') +
			'<button type="button" data-fill="1" title="Fill the browser window with the simulation (Esc leaves). Your browser\'s own full screen: F11 on Windows, Ctrl+Cmd+F on a Mac">⤢ Fill window</button>' +
			'<button type="button" data-cpb="1" hidden title="Put the controls in a panel beside the picture (or back under it)">⇆ Controls beside</button>' +
			'<button type="button" data-hide="1" title="Hide the graphs, readouts and menus under the picture so only the simulation shows">▾ Hide stats</button>';
		wrap.parentNode.insertBefore(bar, wrap);
		var o = { wrap: wrap, bar: bar }; wraps.push(o);
		var stage0 = wrap.querySelector('[class$="-stage"]'), rt = 0;
		if (stage0 && stage0.parentNode !== wrap) { var top0 = stage0; while (top0.parentNode && top0.parentNode !== wrap) top0 = top0.parentNode; if (top0.parentNode === wrap) top0.classList.add('mes-fstage'); }   // the stage sits inside a wrapper (FTL shadow: picture + chart): that wrapper is the picture column
		if (stage0 && window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(function () { if (!filling) apply(); }, 120); }).observe(stage0);
		bar.addEventListener('click', function (e) {
			var b = e.target.closest('button'); if (!b) return;
			if (b.dataset.fill) { fill(wrap); return; }
			if (b.dataset.cpb) { var cpo = wrap.__cp; if (cpo) { cpPref.on = cpo.mode === 'page' ? 0 : 1; cpWrite(); cpSyncAll(); apply(); } return; }
			if (b.dataset.hide) { var hid = !wrap.classList.contains('mes-nopanel'); wrap.classList.toggle('mes-nopanel', hid); try { localStorage.setItem('mes-inlhide', hid ? '1' : '0'); } catch (x) { /* ignore */ } paintHide(wrap, bar); ping(); return; }
			state = { s: b.dataset.s }; write(state); fitPage(state.s); apply();
		});
		var grip = document.createElement('div'); grip.className = 'mes-grip'; grip.title = 'Drag to resize the box, wider or narrower and taller or shorter (double-click: back to the standard size)'; grip.setAttribute('aria-hidden', 'true');
		if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
		wrap.appendChild(grip);
		var drag = null;
		grip.addEventListener('pointerdown', function (e) { var stg = wrap.querySelector('[class$="-stage"]'); drag = { x: e.clientX, y: e.clientY, w: wrap.offsetWidth, h: stg ? stg.offsetHeight : 0 }; try { grip.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } e.preventDefault(); });
		grip.addEventListener('pointermove', function (e) {
			if (!drag) return;
			var col = colW(wrap) || 1e5, w = Math.max(380, Math.min(col, Math.round(drag.w + 2 * (e.clientX - drag.x))));
			var h = (drag.h && !NOCAP.test(wrap.className) && !wrap.__fixedH) ? Math.max(200, Math.min(1800, Math.round(drag.h + (e.clientY - drag.y)))) : 0;
			state = h ? { w: w, h: h } : { w: w }; apply();
		});
		function up() { if (drag) { drag = null; write(state); } }
		grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
		grip.addEventListener('dblclick', function () { state = {}; write(state); apply(); });
		if (state.s) fitPage(state.s);
		apply();
		var ih = null; try { ih = localStorage.getItem('mes-inlhide'); } catch (x) { /* ignore */ }
		if (ih === '1') { wrap.classList.add('mes-nopanel'); }
		paintHide(wrap, bar);
		function chk() { var hb = bar.querySelector('[data-hide]'); if (hb) hb.hidden = !hideables(wrap); }
		if (inited) { cpBuild(); cpSyncAll(); }
		chk(); setTimeout(chk, 1200); window.addEventListener('load', function () { setTimeout(chk, 300); });
	}
	/* "Hide stats": the same .mes-nopanel rule Fill window uses, but in the page itself (remembered in mes-inlhide) */
	function paintHide(wrap, bar) {
		if (!hideables(wrap) && !wrap.classList.contains('mes-nopanel')) { var hb0 = bar.querySelector('[data-hide]'); if (hb0) hb0.hidden = true; return; }
		var hid = wrap.classList.contains('mes-nopanel'), b = bar.querySelector('[data-hide]'); if (!b) return;
		b.textContent = hid ? '▴ Show stats' : '▾ Hide stats'; b.setAttribute('aria-pressed', hid ? 'true' : 'false');
		b.title = hid ? 'Show the graphs, readouts and menus under the picture' : 'Hide the graphs, readouts and menus under the picture so only the simulation shows';
	}

	/* ----- controls beside the picture -----
	   The page's own control cards right after the box (and control rows right before its View bar) are gathered into one side panel:
	   - in the page, when the column is at least 840 px wide (700 px if turned on with the View bar's button): a panel next to the picture (left or right), the picture keeps the rest (turn off with ✕ or the View bar's "Controls beside");
	   - in Fill window / full screen, when the window has room (or a phone is held sideways): the panel moves into the box as its side column, so options can be changed without leaving.
	   Nothing is cloned: the same elements move (a comment marks each one's place) and go back when the mode ends. Choice localStorage mes-cpanel = {on: 0|1, side: 'l'|'r'}. */
	var cpPref = (function () { try { return JSON.parse(localStorage.getItem('mes-cpanel') || '{}') || {}; } catch (e) { return {}; } })();
	if (cpPref.side !== 'r') cpPref.side = 'l';
	function cpWrite() { try { localStorage.setItem('mes-cpanel', JSON.stringify(cpPref)); } catch (e) { /* ignore */ } }
	var cps = [], inited = false, CP_AUTO = 840, CP_MIN = 700;   // column width (px) from which the panel sits beside the picture by itself / can be turned on
	function isWrapEl(el) { return !!(el && el.__mesStage); }
	function hasCtl(el) { return el.matches('input,select,button,textarea,details') || !!el.querySelector('input,select,button,textarea,details'); }
	function stopEl(el) { return /^(H1|H2|H3|H4|H5|SCRIPT|STYLE|ASIDE|NAV|TEMPLATE)$/.test(el.tagName) || el.classList.contains('tu-seo') || el.classList.contains('mes-sbar') || isWrapEl(el) || el.id === 'mes-aside' || el.matches('[role=tablist]') || !!el.querySelector('[role=tablist]'); }
	function cpBuild() {
		wraps.forEach(function (o) {
			if (o.wrap.__cpDone) return; o.wrap.__cpDone = true;
			if (o.bar.parentNode !== o.wrap.parentNode || o.bar.nextElementSibling !== o.wrap) return;   // the View bar sits right before its box (attach puts it there)
			var run = [o.bar, o.wrap], el = o.wrap.nextElementSibling;
			while (el && el.classList.contains('mes-sbar') && isWrapEl(el.nextElementSibling)) { run.push(el, el.nextElementSibling); el.nextElementSibling.__cpDone = true; el = el.nextElementSibling.nextElementSibling; }   // a second box right under the first (View bar + box): one panel for both
			var items = [], p = o.bar.previousElementSibling;
			while (p && !p.__cpClaim && !stopEl(p) && hasCtl(p)) { items.unshift(p); p = p.previousElementSibling; }   // control rows right above the box (picture picker, Pause / Home ...)
			for (; el; el = el.nextElementSibling) { if (stopEl(el)) break; if (hasCtl(el) && !el.__cpClaim) items.push(el); }   // control cards under it, up to the next heading / box / explanation section; readouts and graphs stay where they are
			if (!items.length) return;
			items.forEach(function (it) { it.__cpClaim = true; });
			var panel = document.createElement('aside'); panel.className = 'mes-cpanel'; panel.setAttribute('aria-label', 'Controls');
			panel.innerHTML = '<div class="mes-cphead"><b>Controls</b><button type="button" data-cp="flip" title="Move the controls to the other side">⇄ Side</button><button type="button" data-cp="hide" title="Hide the controls panel">✕ Hide</button></div><div class="mes-cpbody"></div><div class="mes-cpgrip" role="separator" aria-orientation="vertical" aria-label="Controls panel width" tabindex="0" title="Drag to make the controls wider or narrower (arrow keys too; double-click: standard width)"></div>';
			var cp = { run: run, items: items, host: o.wrap, panel: panel, body: panel.querySelector('.mes-cpbody'), box: null, main: null, mode: '', ph: [] };
			run.forEach(function (x) { if (isWrapEl(x)) x.__cp = cp; });
			panel.addEventListener('click', function (e) {
				var b = e.target.closest('[data-cp]'); if (!b) return;
				if (b.dataset.cp === 'flip') { cpFlip(); return; }
				if (cp.mode === 'page') { cpPref.on = 0; cpWrite(); cpSyncAll(); apply(); return; }
				var w = panel.parentNode; if (w && w.__togglePanel) w.__togglePanel();
			});
			cpGrip(cp); cps.push(cp);
		});
	}
	var CP_WMIN = 220, CP_PIC = 320;   // the narrowest controls panel / picture a drag may leave
	function cpClampW(w, avail) { return Math.round(Math.max(CP_WMIN, Math.min(w, avail - CP_PIC))); }   // avail = room for panel + picture (gap already taken off)
	function cpPw(cp) { var col = cp.box && cp.box.parentNode ? cp.box.parentNode.clientWidth : 1200; if (cpPref.w > 0) return cpClampW(cpPref.w, col - 12); return Math.round(Math.max(270, Math.min(380, col * 0.3))); }
	/* the grip on the panel's inner edge: drag (mouse, touch, pen), arrow keys (Shift = bigger steps), double-click / Enter = standard width. Width saved as mes-cpanel.w (px). */
	var cpLastW = 0, cpRt = 0;   // cpLastW: when the panel was last resized (the box changes size on purpose then, so the 'keeps changing size' safety net must not freeze it)
	function cpResizeNow() { if (cpRt) return; cpRt = setTimeout(function () { cpRt = 0; try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ } }, 50); }   // throttled (ping() debounces, which would wait until the drag stops)
	function cpCurW(cp) { return cp.panel.getBoundingClientRect().width; }
	function cpSetW(cp, w) {
		cpLastW = Date.now(); if (w == null) delete cpPref.w; else cpPref.w = Math.round(w);
		if (cp.mode === 'page') { cpSizePage(cp); apply(); }
		else { var wr = cp.panel.parentNode; if (wr) layoutSide(wr); }
		if (cpPref.w > 0) { var shown = Math.round(cpCurW(cp)); if (shown >= CP_WMIN) cpPref.w = shown; }   // keep what is really shown (a drag past the limit does not store a width the next window can't take)
		cpAria(cp); cpResizeNow();
	}
	function cpAria(cp) { var g = cp.grip; if (!g) return; g.setAttribute('aria-valuenow', Math.round(cpCurW(cp))); g.setAttribute('aria-valuemin', CP_WMIN); }
	function cpGrip(cp) {
		var g = cp.panel.querySelector('.mes-cpgrip'); cp.grip = g; var d = null;
		function dir() { return cpPref.side === 'l' ? 1 : -1; }   // panel on the left: its inner edge is its right edge, so dragging right widens it
		g.addEventListener('pointerdown', function (e) {
			if (e.button > 0) return;
			d = { x: e.clientX, w: cpCurW(cp), id: e.pointerId };
			try { g.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
			g.classList.add('is-drag'); document.documentElement.classList.add('mes-cpdrag'); e.preventDefault();
		});
		g.addEventListener('pointermove', function (e) { if (!d || e.pointerId !== d.id) return; cpSetW(cp, d.w + dir() * (e.clientX - d.x)); });
		function up(e) {
			if (!d || (e && e.pointerId !== d.id)) return; d = null; cpLastW = Date.now();
			g.classList.remove('is-drag'); document.documentElement.classList.remove('mes-cpdrag');
			cpWrite(); ping(); setTimeout(ping, 150);
		}
		g.addEventListener('pointerup', up); g.addEventListener('pointercancel', up); g.addEventListener('lostpointercapture', up);
		g.addEventListener('dblclick', function () { cpSetW(cp, null); cpWrite(); ping(); });
		g.addEventListener('keydown', function (e) {
			var step = e.shiftKey ? 64 : 16;
			if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { cpSetW(cp, cpCurW(cp) + dir() * (e.key === 'ArrowRight' ? step : -step)); cpWrite(); e.preventDefault(); }
			else if (e.key === 'Enter' || e.key === ' ') { cpSetW(cp, null); cpWrite(); e.preventDefault(); }
		});
	}
	function cpGather(cp) {   // move the control elements into the panel body
		if (cp.ph.length) return;
		cp.items.forEach(function (it) { var c = document.createComment('mes-cpanel'); it.parentNode.insertBefore(c, it); cp.ph.push([c, it]); cp.body.appendChild(it); });
	}
	function cpRelease(cp) {   // everything back where it was
		cp.ph.forEach(function (pr) { if (pr[0].parentNode) { pr[0].parentNode.insertBefore(pr[1], pr[0]); pr[0].remove(); } }); cp.ph = [];
		if (cp.box) { var par = cp.box.parentNode; cp.run.forEach(function (x) { par.insertBefore(x, cp.box); }); cp.box.remove(); cp.box = cp.main = null; if (cp.ro) { cp.ro.disconnect(); cp.ro = null; } }
		if (cp.panel.parentNode) cp.panel.remove();
		cp.host.__cpPage = false; cp.mode = '';
	}
	function cpBig(cp) { var w = null; cp.run.forEach(function (x) { if (isWrapEl(x) && (x === filling || x === fsWrap)) w = x; }); return w; }
	function cpWant(cp) {
		var big = cpBig(cp);
		if (big) return roomSide(window.innerWidth, window.innerHeight, true) ? ['fill', big] : ['', null];
		if (filling || cpPref.on === 0) return ['', null];
		var par = (cp.box || cp.run[0]).parentNode;
		var cw = par && par.offsetWidth > 0 ? par.clientWidth : 0;
		return (cw >= CP_AUTO || (cpPref.on === 1 && cw >= CP_MIN)) ? ['page', null] : ['', null];
	}
	function cpSync(cp) {
		var want = cpWant(cp), key = want[0] + (want[1] ? cp.run.indexOf(want[1]) : '');
		if (cp.key === key) { if (cp.mode === 'page') cpSizePage(cp); return; }
		cpRelease(cp); cp.key = key;
		cp.run.forEach(function (x) { if (isWrapEl(x)) { x.__asp = 0; x.__m = null; x.__fixedH = false; } });   // aspects measured in the old layout are stale
		if (want[0] === 'page') {
			var box = document.createElement('div'); box.className = 'mes-cbox' + (cpPref.side === 'l' ? ' mes-cleft' : '');
			var main = document.createElement('div'); main.className = 'mes-cmain';
			cp.run[0].parentNode.insertBefore(box, cp.run[0]); box.appendChild(main); cp.run.forEach(function (x) { main.appendChild(x); });
			cpGather(cp); box.appendChild(cp.panel); cp.box = box; cp.main = main; cp.mode = 'page'; cp.host.__cpPage = true;
			if (window.ResizeObserver) { cp.ro = new ResizeObserver(function () { cpSizePage(cp); }); cp.ro.observe(main); }
			cpSizePage(cp);
		} else if (want[0] === 'fill') {
			cpGather(cp); want[1].appendChild(cp.panel); cp.mode = 'fill';
		}
		cpPaint(cp); ping(); setTimeout(ping, 150); setTimeout(function () { cpAria(cp); }, 200);
	}
	function cpSizePage(cp) {
		if (!cp.box) return;
		cp.box.style.setProperty('--mes-pw', cpPw(cp) + 'px');
		cp.box.style.setProperty('--mes-cph', Math.max(cp.main.offsetHeight, Math.min(window.innerHeight - 90, 720)) + 'px');
	}
	function cpPaint(cp) {
		var hb = cp.panel.querySelector('[data-cp="hide"]'); hb.textContent = cp.mode === 'page' ? '✕ Hide' : '▾ Hide panel';
		cp.run.forEach(function (x) {
			if (!isWrapEl(x)) return;
			wraps.forEach(function (o) {
				if (o.wrap !== x) return; var b = o.bar.querySelector('[data-cpb]'); if (!b) return;
				var par = (cp.box || cp.run[0]).parentNode, room = par && par.clientWidth >= CP_MIN;
				b.hidden = !(room || cp.mode === 'page') || x !== cp.host; b.setAttribute('aria-pressed', cp.mode === 'page' ? 'true' : 'false');
				b.textContent = cp.mode === 'page' ? '⇆ Controls below' : '⇆ Controls beside';
				b.title = cp.mode === 'page' ? 'Put the controls back under the picture' : 'Put the controls in a panel beside the picture';
			});
		});
	}
	function cpSyncAll() { if (!inited) return; cps.forEach(function (cp) { try { cpSync(cp); cpPaint(cp); } catch (e) { /* ignore */ } }); }
	function cpFlip() {
		cpPref.side = cpPref.side === 'l' ? 'r' : 'l'; cpWrite();
		cps.forEach(function (cp) { if (cp.box) cp.box.classList.toggle('mes-cleft', cpPref.side === 'l'); });
		[filling, fsWrap].forEach(function (w) { if (w) w.classList.toggle('mes-fleft', cpPref.side === 'l' && w.classList.contains('mes-fside')); });
		ping();
	}

	/* ----- fill the browser window ----- */
	function fillWidth(wrap) {
		if (isFree(wrap)) return window.innerWidth;   // a free-shape simulation uses the whole window and lays itself out for it
		var stage = wrap.querySelector('[class$="-stage"]') || wrap.firstElementChild, aspect = 16 / 9;
		if (wrap.__aspect) aspect = wrap.__aspect;
		else if (stage && stage.offsetWidth > 0 && stage.offsetHeight > 0) aspect = wrap.__aspect = stage.offsetWidth / stage.offsetHeight;
		var extra = wrap.__extra != null ? wrap.__extra : (wrap.__extra = Math.max(0, wrap.offsetHeight - (stage ? stage.offsetHeight : 0)));
		return Math.max(320, Math.min(window.innerWidth, Math.round((window.innerHeight - 34 - extra - 4) * aspect)));
	}
	/* does the box have anything the Hide stats / Hide panel buttons would actually hide (graphs, readouts)? Not the stage, grip, top bar, or the controls that stay (Play / Restart, Solar System transport) */
	function hideables(wrap) {
		return Array.prototype.filter.call(wrap.children, function (k) {
			if ((k.matches && k.matches('[class$="-stage"]')) || k.classList.contains('mes-fstage') || k.classList.contains('mes-grip') || k.classList.contains('mes-top') || k.classList.contains('td-run') || k.classList.contains('ss-transport')) return false;
			var cs = getComputedStyle(k); return cs.position !== 'absolute' && cs.position !== 'fixed' && (k.offsetHeight > 0 || wrap.classList.contains('mes-nopanel'));
		}).length > 0;
	}
	/* phone held sideways / wide window with the panel shown (the backgammon layout): the picture keeps the whole height on the left and the
	   readouts, graphs and controls go into a scrolling column on the right (.mes-fside). The simulations size themselves from wrap.clientWidth,
	   so while the box is in this layout wrap.clientWidth reports the picture column's width (an own getter, removed again afterwards). */
	var CW = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
	function sideWanted(wrap) {
		var big = wrap.classList.contains('mes-fill') || wrap.classList.contains('mes-fs');
		var w = window.innerWidth, h = window.innerHeight;
		return big && !wrap.classList.contains('mes-nopanel') && roomSide(w, h, !!wrap.__cp) && (hideables(wrap) || cpIn(wrap));
	}
	function roomSide(w, h, hasCp) { return (w >= 560 && w >= h * 1.25 && h < 900) || (hasCp && w >= 880); }   // a phone held sideways, or any window wide enough for a controls column next to the picture
	function cpIn(wrap) { var cp = wrap.__cp; return !!(cp && cp.panel.parentNode === wrap); }
	function layoutSide(wrap) {
		if (!wrap) return;
		var on = sideWanted(wrap), was = wrap.classList.contains('mes-fside');
		if (on) {
			var W = wrap.classList.contains('mes-fill') ? window.innerWidth : CW.get.call(wrap);
			var pw = Math.round(Math.max(220, Math.min(cpIn(wrap) ? 400 : 380, W * (cpIn(wrap) ? 0.28 : 0.34)))), gap = 10;
			if (cpIn(wrap) && cpPref.w > 0) { var cs0 = getComputedStyle(wrap); pw = cpClampW(cpPref.w, W - gap - (parseFloat(cs0.paddingLeft) || 0) - (parseFloat(cs0.paddingRight) || 0)); }   // the width the visitor dragged the controls panel to
			if (wrap.classList.contains('mes-fill')) wrap.style.setProperty('--mes-fw', window.innerWidth + 'px');
			wrap.style.setProperty('--mes-pw', pw + 'px');
			wrap.classList.add('mes-fside'); wrap.classList.toggle('mes-fleft', cpPref.side === 'l');
			if (!wrap.__cwOwn) { wrap.__cwOwn = true; Object.defineProperty(wrap, 'clientWidth', { configurable: true, get: function () { var cs = getComputedStyle(this); return Math.max(200, CW.get.call(this) - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - (parseFloat(cs.getPropertyValue('--mes-pw')) || pw) - gap); } }); }
		} else if (was || wrap.__cwOwn) {
			wrap.classList.remove('mes-fside', 'mes-fleft'); wrap.style.removeProperty('--mes-pw');
			if (wrap.__cwOwn) { delete wrap.clientWidth; wrap.__cwOwn = false; }
			if (wrap.classList.contains('mes-fill')) wrap.style.setProperty('--mes-fw', fillWidth(wrap) + 'px');
		}
	}
	/* the height a stage may take inside a filled / full-screen box: the window minus the 34px top bar minus whatever panels (readouts, graphs) are showing */
	function fillH(wrap) {
		var top = (wrap.classList.contains('mes-fill') || wrap.classList.contains('mes-fs')) ? 34 : 0, extra = 0;
		if (wrap.classList.contains('mes-fside')) return Math.max(120, window.innerHeight - top - 2);
		Array.prototype.forEach.call(wrap.children, function (k) {
			if ((k.matches && k.matches('[class$="-stage"]')) || k.classList.contains('mes-fstage') || k.classList.contains('mes-grip') || k.classList.contains('mes-top')) return;
			var cs = getComputedStyle(k); if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') return;
			extra += k.offsetHeight + (parseFloat(cs.marginTop) || 0) + (parseFloat(cs.marginBottom) || 0);
		});
		return Math.max(120, window.innerHeight - top - extra - 2);
	}
	/* the top bar: [Hide panel / Show panel] [Close]; it never covers the picture's own buttons */
	function topBar(wrap, inside, onClose) {
		var bar = document.createElement('div'); bar.className = 'mes-top' + (inside ? ' mes-top--in' : ''); bar.setAttribute('role', 'toolbar');
		var tt = document.createElement('span'); tt.className = 'mes-tt'; tt.textContent = document.title.split(' | ')[0];
		var pb = document.createElement('button'); pb.type = 'button';
		var cb = document.createElement('button'); cb.type = 'button'; cb.textContent = '✕ Close (Esc)'; cb.onclick = onClose;
		function paint() { var hid = wrap.classList.contains('mes-nopanel'); pb.textContent = hid ? '▴ Show panel' : '▾ Hide panel'; pb.title = hid ? 'Show the readouts and controls under the picture' : 'Hide the readouts and controls: the picture gets the whole window'; pb.setAttribute('aria-pressed', hid ? 'true' : 'false'); }
		pb.onclick = function () { var hid = !wrap.classList.contains('mes-nopanel'); wrap.classList.toggle('mes-nopanel', hid); try { localStorage.setItem('mes-fillpanel', hid ? '0' : '1'); } catch (e) { /* ignore */ } paint(); cpSyncAll(); ping(); setTimeout(ping, 150); };
		wrap.__togglePanel = pb.onclick;
		var fb = document.createElement('button'); fb.type = 'button'; fb.textContent = '⇄ Side'; fb.title = 'Move the side panel to the other side'; fb.onclick = function () { cpFlip(); };
		bar.appendChild(tt); bar.appendChild(fb); bar.appendChild(pb); bar.appendChild(cb);
		wrap.__paintTop = function () { paint(); fb.hidden = !wrap.classList.contains('mes-fside'); };
		bar.__fb = fb;
		var pref = null; try { pref = localStorage.getItem('mes-fillpanel'); } catch (e) { /* ignore */ }
		wrap.classList.toggle('mes-nopanel', pref === '0' || (pref === null && window.innerHeight < 520));   // a phone held sideways starts with the panel hidden
		if (!hideables(wrap) && !wrap.__cp) { pb.hidden = true; wrap.classList.remove('mes-nopanel'); }   // nothing to hide on this page (Solar System Today): no dead button
		paint(); return bar;
	}
	function fill(wrap) {
		if (filling) return;
		wrap.__aspect = null; wrap.__extra = null; fillWidth(wrap);   // measure before the class changes the layout
		wrap.__sh = 0; wrap.__she = 0; wrap.style.removeProperty('--mes-sh'); wrap.style.removeProperty('--mes-shmax');   // the preset's height cap does not apply to a filled box
		filling = wrap;
		backdrop = document.createElement('div'); backdrop.className = 'mes-fill-bd'; document.body.appendChild(backdrop);
		closeBtn = topBar(wrap, false, leave); document.body.appendChild(closeBtn);
		wrap.style.setProperty('--mes-fw', fillWidth(wrap) + 'px'); wrap.classList.add('mes-fill'); document.documentElement.classList.add('mes-fill-on');
		cpSyncAll(); ping(); setTimeout(ping, 150);
	}
	function leave() {
		if (!filling) return;
		filling.classList.remove('mes-fill', 'mes-nopanel'); layoutSide(filling); stageFloor(filling); filling.style.removeProperty('--mes-fw');
		var ih = null; try { ih = localStorage.getItem('mes-inlhide'); } catch (x) { /* ignore */ } if (ih === '1') filling.classList.add('mes-nopanel');
		wraps.forEach(function (o) { if (o.wrap === filling) paintHide(o.wrap, o.bar); }); document.documentElement.classList.remove('mes-fill-on');
		if (backdrop) backdrop.remove(); if (closeBtn) closeBtn.remove(); backdrop = closeBtn = null; filling = null;
		cpSyncAll(); apply(); ping(); setTimeout(ping, 150);
	}
	document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && filling && !document.fullscreenElement) leave(); });
	window.addEventListener('resize', function () { cpSyncAll(); if (filling) { if (!filling.classList.contains('mes-fside')) filling.style.setProperty('--mes-fw', fillWidth(filling) + 'px'); layoutSide(filling); } else apply(); if (fsWrap) layoutSide(fsWrap); });
	/* the browser's own full screen on a simulation box: same top bar (inside the box, the only thing visible in full screen) and the same hide / show panel */
	var fsBar = null, fsWrap = null;
	document.addEventListener('fullscreenchange', function () {
		var el = document.fullscreenElement;
		if (fsWrap) { fsWrap.classList.remove('mes-fs', 'mes-nopanel'); layoutSide(fsWrap); stageFloor(fsWrap); if (fsBar) fsBar.remove(); fsBar = fsWrap = null; }
		if (el && wraps.some(function (o) { return o.wrap === el; })) {
			fsWrap = el; el.classList.add('mes-fs'); fsBar = topBar(el, true, function () { try { document.exitFullscreen(); } catch (e) { /* ignore */ } }); el.insertBefore(fsBar, el.firstChild);
		}
		cpSyncAll(); ping(); setTimeout(ping, 150);
	});

	function init() {
		var sel = PREFIX.map(function (p) { return '.' + p + '-wrap'; }).join(',');
		Array.prototype.forEach.call(document.querySelectorAll(sel), attach);
		inited = true; cpBuild(); cpSyncAll(); apply();
		if (window.ResizeObserver) { var rt2 = 0; new ResizeObserver(function () { clearTimeout(rt2); rt2 = setTimeout(function () { cpSyncAll(); apply(); }, 150); }).observe(document.body); }
	}
	window.MESStage = { attach: attach, apply: apply, leave: leave, fillH: fillH, sh: function (stage, h) { var w = stage && stage.parentNode, o = w && w.__sh; if (!o) return h; return w.__she ? o : Math.min(h, o); } };
	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
