/* MES offline copies (2026-11-25): registers /offline-sw.js for this page (site-search.js loads this only on the pages in its
   OFFLINE_PAGES list) and adds a small "Works offline" line under the page description. When the connection drops, the line says so. */
(function () {
	"use strict";
	if (!("serviceWorker" in navigator) || window.__mesOffline) return;
	window.__mesOffline = 1;
	var page = location.pathname.replace(/\/index\.html$/, "").replace(/\.html$/, "").replace(/\/+$/, "");
	if (!/^\/[a-z0-9-]+$/.test(page)) return;
	function note(text) {
		var n = document.getElementById("mes-offline-note");
		if (!n) {
			var after = document.querySelector(".page-description") || document.querySelector("h1");
			if (!after) return;
			n = document.createElement("p"); n.id = "mes-offline-note";
			n.style.cssText = "font-size:0.85em;margin:0.3em 0 0.6em;opacity:0.85;";
			after.parentNode.insertBefore(n, after.nextSibling);
		}
		n.textContent = text;
		extraButton();
	}
	var OK = "✓ Works offline: after this visit the page opens even with no internet connection.";
	/* pages with pictures / sounds loaded later (the kids pages) offer window.MESOfflineFiles() -> Promise<[urls]>: one button saves them all */
	function extraButton() {
		var n = document.getElementById("mes-offline-note");
		if (!n || typeof window.MESOfflineFiles !== "function" || document.getElementById("mes-offline-more")) return;
		var b = document.createElement("button");
		b.type = "button"; b.id = "mes-offline-more"; b.className = "tu-btn";
		b.style.cssText = "margin-left:0.5em;font-size:0.95em;padding:0.15em 0.6em;";
		var done = false;
		try { done = localStorage.getItem("mes-offline:" + page) === "1"; } catch (e) {}
		b.textContent = done ? "Update saved pictures and sounds" : "Save pictures and sounds too";
		n.appendChild(b);
		b.addEventListener("click", function () {
			b.disabled = true; b.textContent = "Getting the list…";
			Promise.resolve(window.MESOfflineFiles()).then(function (urls) {
				var i = 0, ok = 0, total = urls.length;
				function next() {
					if (i >= total) return Promise.resolve();
					var u = urls[i++];
					return fetch(u).then(function (r) { if (r.ok) ok++; }, function () {}).then(function () { b.textContent = "Saving " + i + " of " + total + "…"; return next(); });
				}
				return Promise.all([next(), next(), next(), next()]).then(function () {
					b.textContent = "✓ Saved " + ok + " pictures and sounds for offline";
					try { localStorage.setItem("mes-offline:" + page, "1"); } catch (e) {}
				});
			}).catch(function () { b.disabled = false; b.textContent = "Could not save them: try again"; });
		});
	}
	navigator.serviceWorker.register("/offline-sw.js?p=" + encodeURIComponent(page), { scope: page }).then(function (reg) {
		if (reg.active) note(OK); else navigator.serviceWorker.ready.then(function () { note(OK); });
	}, function () {});
	window.addEventListener("offline", function () { note("You are offline: this page keeps working (leaderboards, sharing and ads need a connection)."); });
	window.addEventListener("online", function () { note(OK); });
})();
