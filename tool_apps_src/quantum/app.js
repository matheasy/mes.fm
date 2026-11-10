/* MES Quantum Lab page shell: tabs from data-views, ?tab=, shared saved state, lazy init of each simulator (MESQ.ui[tab] from ui-*.js).
   Each UI gets api = {root, panel, st (its own saved object), save(), toast(msg), copy(text, msg), setQuery(obj), dark(), onTheme(fn)} and must stop its animation in hide(). */
(function () {
	"use strict";
	var Q = window.MESQ, root = document.getElementById("qm"); if (!root || !Q) return;
	var KEY = "mes-quantum:v1", all = {};
	try { all = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) {}
	var saveT = 0;
	function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {} }, 300); }
	var toastT;
	function toast(msg) { var t = document.getElementById("qm-toast"); if (!t) { t = document.createElement("div"); t.id = "qm-toast"; t.className = "tu-toast"; t.setAttribute("role", "status"); document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	function copy(s, msg) { var done = function () { toast(msg || "Copied"); }; if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(s).then(done, function () { prompt("Copy:", s); }); else prompt("Copy:", s); }
	function dark() { return document.body.classList.contains("dark-mode"); }
	var themeFns = [];
	new MutationObserver(function () { themeFns.forEach(function (f) { try { f(dark()); } catch (e) {} }); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });

	var views = (root.getAttribute("data-views") || "").split(",").filter(Boolean);
	var tabs = root.querySelectorAll(".qm-tabs [data-tab]");
	Array.prototype.forEach.call(tabs, function (b) { if (views.indexOf(b.dataset.tab) < 0) b.remove(); });
	Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { if (views.indexOf(p.dataset.panel) < 0) p.remove(); });
	if (views.length < 2) { var tb = root.querySelector(".qm-tabs"); if (tb) tb.hidden = true; }

	var q = new URLSearchParams(location.search), page = root.getAttribute("data-page") || "quantum";
	var started = {}, cur = null;
	function setQuery(o) {
		var u = new URL(location.href);
		Object.keys(o || {}).forEach(function (k) { if (o[k] == null || o[k] === "") u.searchParams.delete(k); else u.searchParams.set(k, o[k]); });
		history.replaceState(null, "", u.pathname + (u.searchParams.toString() ? "?" + u.searchParams.toString() : "") + u.hash);
	}
	function api(tab, panel) {
		all[tab] = all[tab] || {};
		return { root: root, panel: panel, st: all[tab], save: save, toast: toast, copy: copy, setQuery: setQuery, dark: dark, query: q,
			onTheme: function (f) { themeFns.push(f); }, show: function (t) { setTab(t); } };
	}
	function setTab(t, quiet) {
		if (views.indexOf(t) < 0) t = views[0];
		if (cur === t) return;
		if (cur && Q.ui[cur] && started[cur] && Q.ui[cur].hide) try { Q.ui[cur].hide(); } catch (e) { console.error(e); }
		cur = t;
		Array.prototype.forEach.call(root.querySelectorAll(".qm-tabs [data-tab]"), function (b) { b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false"); b.tabIndex = b.dataset.tab === t ? 0 : -1; });
		Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.dataset.panel !== t; });
		var panel = root.querySelector('[data-panel="' + t + '"]'), ui = Q.ui[t];
		if (ui && panel) {
			try {
				if (!started[t]) { started[t] = true; ui.init(panel, api(t, panel)); }
				if (ui.show) ui.show();
			} catch (e) { console.error(e); }
		}
		all.tab = all.tab || {}; all.tab[page] = t; save();
		if (!quiet) setQuery({ tab: t === views[0] ? null : t });
		window.dispatchEvent(new Event("resize"));
	}
	var bar = root.querySelector(".qm-tabs");
	if (bar) {
		bar.addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) setTab(b.dataset.tab); });
		bar.addEventListener("keydown", function (e) {
			var list = Array.prototype.slice.call(bar.querySelectorAll("[data-tab]")), i = list.indexOf(document.activeElement); if (i < 0) return;
			var n = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? list.length - 1 : -1;
			if (n < 0 && e.key !== "ArrowLeft") return; e.preventDefault(); n = (n + list.length) % list.length; list[n].focus(); setTab(list[n].dataset.tab);
		});
	}
	document.addEventListener("visibilitychange", function () { var ui = Q.ui[cur]; if (!ui || !started[cur]) return; try { if (document.hidden) { if (ui.hide) ui.hide(); } else if (ui.show) ui.show(); } catch (e) {} });
	var want = q.get("tab") || (all.tab && all.tab[page]) || views[0];
	setTab(want, !q.get("tab"));
	window.MESQuantumDebug = { setTab: setTab, state: all, cur: function () { return cur; } };
})();
