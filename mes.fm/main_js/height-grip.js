/* MES height grip: a drag bar under a viewer box to make it taller or shorter.
 *
 * MESGrip.add(el, {key, min, max})
 *   el   = the box (its CSS must use height: var(--mes-gh, <default>) so the
 *          page's own Fill window / full screen rules still win)
 *   key  = localStorage name for the chosen height (per page / box)
 *   min  = smallest height in px (default 200)
 * or just put data-mes-grip="<key>" (+ data-mes-grip-min) on the box.
 * Drag (mouse, touch, pen), arrow keys when focused (Shift = bigger steps),
 * double-click or Enter = back to the page's default height.
 * The grip hides itself while the box is stretched by a fill / full screen
 * layout (flex-grow > 0 or a :fullscreen ancestor).
 */
(function () {
	"use strict";
	if (window.MESGrip) return;
	var CSS = ".mes-hgrip{display:flex;align-items:center;justify-content:center;height:14px;margin:0;cursor:ns-resize;touch-action:none;user-select:none;-webkit-user-select:none;outline:none;border-radius:0 0 8px 8px}" +
		".mes-hgrip::before{content:'';width:46px;height:5px;border-radius:3px;background:rgba(127,127,127,.45);transition:background .15s,width .15s}" +
		".mes-hgrip:hover::before,.mes-hgrip:focus-visible::before,.mes-hgrip.is-drag::before{background:rgba(37,99,235,.85);width:70px}" +
		".mes-hgrip:focus-visible{box-shadow:inset 0 0 0 2px rgba(37,99,235,.6)}" +
		".mes-hgrip[hidden]{display:none!important}" +
		"body.mes-hgrip-drag,body.mes-hgrip-drag *{cursor:ns-resize!important;user-select:none!important}" +
		"@media (pointer:coarse){.mes-hgrip{height:22px}}" +
		"@media print{.mes-hgrip{display:none!important}}";
	function css() {
		if (document.getElementById("mes-hgrip-css")) return;
		var s = document.createElement("style"); s.id = "mes-hgrip-css"; s.textContent = CSS; document.head.appendChild(s);
	}
	function load(k) { try { var v = parseFloat(localStorage.getItem(k)); return v > 0 ? v : 0; } catch (e) { return 0; } }
	function save(k, v) { try { if (v) localStorage.setItem(k, String(Math.round(v))); else localStorage.removeItem(k); } catch (e) {} }

	function add(el, opt) {
		if (!el || el.__mesGrip) return el && el.__mesGrip;
		opt = opt || {}; css();
		var key = opt.key || ("mes-hgrip:" + location.pathname), min = opt.min || 200;
		var g = document.createElement("div");
		g.className = "mes-hgrip"; g.tabIndex = 0;
		g.setAttribute("role", "separator"); g.setAttribute("aria-orientation", "horizontal");
		g.setAttribute("aria-label", "Drag to change the height");
		g.title = "Drag to make it taller or shorter (double-click: back to normal)";
		el.parentNode.insertBefore(g, el.nextSibling);

		function maxH() { return Math.max(min + 50, opt.max || Math.max(window.innerHeight * 3, 2400)); }
		function set(h, keep) {
			if (h) { h = Math.max(min, Math.min(maxH(), h)); el.style.setProperty("--mes-gh", h + "px"); }
			else el.style.removeProperty("--mes-gh");
			if (!keep) save(key, h);
			g.setAttribute("aria-valuenow", String(Math.round(el.getBoundingClientRect().height)));
			if (opt.onChange) opt.onChange(h);
		}
		/* hidden when the box can't change height right now: Fill window / full screen
		   (height auto, flex or 100%), phone layouts with height:auto, or display:none */
		function stretched() {
			for (var n = el; n; n = n.parentElement) if (n === document.fullscreenElement || n === document.webkitFullscreenElement) return true;
			for (var m = el, i = 0; m && i < 6; m = m.parentElement, i++) if (getComputedStyle(m).position === "fixed") return true;
			var old = el.style.getPropertyValue("--mes-gh"), h1 = el.offsetHeight;
			if (!h1) return true;
			el.style.setProperty("--mes-gh", (h1 + 37) + "px");
			var h2 = el.offsetHeight;
			if (old) el.style.setProperty("--mes-gh", old); else el.style.removeProperty("--mes-gh");
			return h2 === h1;
		}
		function vis() { g.hidden = stretched(); }

		var saved = load(key); if (saved) set(saved, true);

		var y0 = 0, h0 = 0, id = null;
		g.addEventListener("pointerdown", function (e) {
			if (e.button && e.button !== 0) return;
			e.preventDefault(); id = e.pointerId; y0 = e.clientY; h0 = el.getBoundingClientRect().height;
			try { g.setPointerCapture(id); } catch (x) {}
			g.classList.add("is-drag"); document.body.classList.add("mes-hgrip-drag");
		});
		g.addEventListener("pointermove", function (e) {
			if (e.pointerId !== id) return;
			set(h0 + e.clientY - y0, true);
			/* keep the grip on screen when dragging near the bottom edge */
			if (e.clientY > window.innerHeight - 30) window.scrollBy(0, 12);
		});
		function end(e) {
			if (e.pointerId !== id) return;
			id = null; g.classList.remove("is-drag"); document.body.classList.remove("mes-hgrip-drag");
			var h = el.style.getPropertyValue("--mes-gh"); save(key, parseFloat(h) || 0);
		}
		g.addEventListener("pointerup", end); g.addEventListener("pointercancel", end);
		g.addEventListener("dblclick", function () { set(0); });
		g.addEventListener("keydown", function (e) {
			var step = e.shiftKey ? 200 : 40, h = el.getBoundingClientRect().height;
			if (e.key === "ArrowDown") set(h + step); else if (e.key === "ArrowUp") set(h - step);
			else if (e.key === "Enter" || e.key === "Home") set(0);
			else return;
			e.preventDefault();
		});
		if (window.ResizeObserver) new ResizeObserver(vis).observe(el);
		document.addEventListener("fullscreenchange", vis);
		if (window.MutationObserver) {
			var mo = new MutationObserver(vis);
			for (var n = el, i = 0; n && i < 4; n = n.parentElement, i++) mo.observe(n, {attributes: true, attributeFilter: ["class"]});
		}
		vis();
		var api = {el: el, grip: g, set: set, reset: function () { set(0); }};
		el.__mesGrip = api;
		return api;
	}
	window.MESGrip = {add: add};
	/* automatic: <div data-mes-grip="localStorage key" data-mes-grip-min="300"> */
	function auto() {
		var els = document.querySelectorAll("[data-mes-grip]");
		for (var i = 0; i < els.length; i++) add(els[i], {key: els[i].getAttribute("data-mes-grip"), min: +els[i].getAttribute("data-mes-grip-min") || 0});
	}
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto); else auto();
})();
