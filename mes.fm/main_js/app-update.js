/*
 * MES apps: "Update available" note (Capacitor apps; copied into each app's www/js by its build-www.py via app_update.py).
 *
 *   <script src="js/app-update.js" data-app="timer" data-ios="6833587925" data-android="fm.mes.timer"
 *           data-v-ios="1.0" data-v-android="1.0.2" data-code-android="4"></script>
 *
 * iPhone: the App Store's own lookup (itunes.apple.com, CORS-open) says the newest version, so the note appears by itself once
 * Apple releases an update. Android: Google Play has no public lookup, so https://mes.fm/apps/latest.json says the newest
 * versionCode released per app ({"timer": {"android": 3, "name": "1.0.1"}}); update it when a release goes out on Play.
 * Shows a closable bar at the top of the app (x = not again for this version) and an "Update available" item at the top of
 * the burger menu (#menu), which stays until the app is updated. Checks at most every 6 hours; nothing else is sent.
 */
(function () {
	var me = document.currentScript;
	if (!me) return;
	var D = me.dataset, cap = window.Capacitor;
	var plat = cap && cap.getPlatform ? cap.getPlatform() : "web";
	if (plat !== "ios" && plat !== "android") {   // testing in a browser: ?updtest=ios|android
		var tm = /[?&]updtest=(ios|android)/.exec(location.search);
		if (!tm) return;
		plat = tm[1];
	}
	var KEY = "mes-app-update:" + D.app, ttl = 6 * 3600 * 1000;

	function newer(a, b) {   // is version string a newer than b?
		var x = String(a || "").split("."), y = String(b || "").split(".");
		for (var i = 0; i < Math.max(x.length, y.length); i++) {
			var p = parseInt(x[i] || "0", 10) || 0, q = parseInt(y[i] || "0", 10) || 0;
			if (p !== q) return p > q;
		}
		return false;
	}
	function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
	function save(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) {} }

	var st = load();
	var storeUrl = plat === "ios" ? "https://apps.apple.com/app/id" + D.ios : "https://play.google.com/store/apps/details?id=" + D.android;

	function check(done) {
		if (st.at && Date.now() - st.at < ttl && st.plat === plat) return done();
		var url = plat === "ios" ? "https://itunes.apple.com/lookup?id=" + D.ios + "&t=" + Date.now()
			: "https://mes.fm/apps/latest.json?t=" + Math.floor(Date.now() / 60000);
		fetch(url, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) {
			var latest = null, name = "";
			if (plat === "ios") { var r0 = j && j.results && j.results[0]; if (r0) { latest = r0.version; name = r0.version; st.notes = (r0.releaseNotes || "").slice(0, 300); } }
			else { var a = j && j[D.app]; if (a && a.android) { latest = a.android; name = a.name || ""; st.notes = a.notes || ""; } }
			st.at = Date.now(); st.plat = plat; st.latest = latest; st.name = name;
			save(st); done();
		}).catch(function () { done(); });
	}

	function available() {
		if (st.latest == null || st.plat !== plat) return false;
		if (plat === "ios") return newer(st.latest, D.vIos);
		return Number(st.latest) > Number(D.codeAndroid || 0);
	}

	function css() {
		if (document.getElementById("mes-upd-css")) return;
		var s = document.createElement("style"); s.id = "mes-upd-css";
		s.textContent = ".mes-upd{display:flex;align-items:center;gap:.6em;margin:.6em .75em;padding:.65em .5em .65em .9em;border-radius:12px;" +
			"background:#e7f5ec;color:#14532d;border:1px solid #9bd3ae;font:15px/1.35 system-ui,-apple-system,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.08)}" +
			".mes-upd .mu-t,.mes-upd b,.mes-upd small{color:inherit!important}.mes-upd .mu-t{flex:1;min-width:0}.mes-upd b{display:block;font-size:1.02em}.mes-upd small{opacity:.85}" +
			".mes-upd a.mu-go{flex:none;background:#15803d;color:#fff!important;text-decoration:none;font-weight:700;padding:.55em .95em;border-radius:9px;white-space:nowrap}" +
			".mes-upd button{flex:none;width:2.4em;height:2.4em;border:0;border-radius:50%;background:transparent;color:inherit;font-size:1.15em;line-height:1;cursor:pointer;opacity:.75}" +
			".mes-upd button:active{background:rgba(0,0,0,.1)}" +
			"body.dark-mode .mes-upd{background:#12301e;color:#d7f5e1!important;border-color:#2f6b45}.mes-upd{color:#14532d!important}" +
			"#menu a.mu-menu,ul.navbar a.mu-menu{display:flex!important;align-items:center;gap:.5em;white-space:normal;font-weight:700;color:#15803d!important}" +
			"body.dark-mode #menu a.mu-menu,body.dark-mode ul.navbar a.mu-menu{color:#6ee49a!important}" +
			"a.mu-menu .mu-dot{width:.55em;height:.55em;border-radius:50%;background:#e03131;flex:none}";
		document.head.appendChild(s);
	}

	function show() {
		if (!available()) return;
		css();
		var ver = st.name ? " " + st.name : "", label = "Update available" + ver;
		var menu = document.getElementById("menu") || document.querySelector("ul.navbar");
		if (menu && !menu.querySelector(".mu-menu")) {
			var a = document.createElement("a");
			a.className = "mu-menu"; a.href = storeUrl; a.target = "_blank"; a.rel = "noopener";
			a.innerHTML = '<span class="mu-dot"></span><span></span>';
			a.lastChild.textContent = st.name ? "Update to " + st.name : "Update the app";
			a.title = label + (plat === "ios" ? " in the App Store" : " on Google Play");
			var el = a;
			if (menu.tagName === "UL") { el = document.createElement("li"); el.className = "navbar__item"; a.className += " navbar__link"; el.appendChild(a); }
			menu.insertBefore(el, menu.firstChild);
		}
		if (st.closed === String(st.latest) || document.querySelector(".mes-upd")) return;
		var bar = document.createElement("div");
		bar.className = "mes-upd"; bar.setAttribute("role", "status");
		bar.innerHTML = '<div class="mu-t"><b></b><small>Get the newest version for fixes and new features. You can also update from the menu.</small></div>' +
			'<a class="mu-go" target="_blank" rel="noopener">Update</a><button type="button" aria-label="Close">&#10005;</button>';
		bar.querySelector("b").textContent = label;
		bar.querySelector(".mu-go").href = storeUrl;
		bar.querySelector("button").addEventListener("click", function () { st.closed = String(st.latest); save(st); bar.remove(); });
		var main = document.getElementById("app-main") || document.querySelector("main");
		if (main) main.parentNode.insertBefore(bar, main);
		else { var h = document.getElementById("header"); if (h) h.parentNode.insertBefore(bar, h.nextSibling); else document.body.insertBefore(bar, document.body.firstChild); }
	}

	function go() { check(show); }
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
	document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") go(); });
	window.MESAppUpdate = { check: function () { st.at = 0; go(); }, state: function () { return st; } };
})();
