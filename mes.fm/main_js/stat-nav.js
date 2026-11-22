/* MES stats pages navigation (2026-11-21).
   One tab strip shared by /stats, /installs, /seo, /ads, /search-console, /dashboard, /polls-stats
   so they read as pages of one place, not like the time-range buttons under them.

   Markup (put it first inside the page, then load this script right after it, NOT deferred):
     <nav class="mes-snav" data-cur="stats" aria-label="Stats pages">
       <a href="/stats">Site stats</a> <a href="/installs">App installs</a> <a href="/seo">SEO Checker</a>
       <a class="mes-snav-x" href="https://adsense.google.com/" target="_blank" rel="noopener">AdSense</a>
     </nav><script src="/main_js/stat-nav.js"></script>
   The plain links are the no-JavaScript fallback; this script rebuilds the strip from PAGES below,
   keeps any .mes-snav-x links (outside links / extras) at the end, and shows the owner-only pages
   only when localStorage mes-owner = "1" (set by the private pages) or on a private page itself. */
(function () {
	"use strict";
	var I = {
		stats: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
		installs: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
		seo: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5.5 5.5"/>',
		ads: '<circle cx="12" cy="12" r="9"/><path d="M15 9.2c-.6-1-1.7-1.5-3-1.5-1.7 0-3 .9-3 2.1 0 2.9 6 1.4 6 4.3 0 1.2-1.3 2.2-3 2.2-1.4 0-2.6-.6-3.1-1.6M12 6v1.7M12 16.3V18"/>',
		sc: '<path d="M3 17l5-5 4 4 8-9"/><path d="M15 7h5v5"/>',
		channels: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="m10 9 5 3-5 3z"/>',
		polls: '<path d="M4 6h10M4 12h16M4 18h7"/>',
		x: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'
	};
	var PAGES = [
		["stats", "/stats", "Site stats"],
		["installs", "/installs", "App installs"],
		["seo", "/seo", "SEO Checker"],
		["ads", "/ads", "Ad money", 1],
		["sc", "/search-console", "Search Console", 1],
		["channels", "/dashboard", "Channels", 1],
		["polls", "/polls-stats", "Polls", 1]
	];
	var CSS = [
		".mes-snav{display:flex;flex-wrap:wrap;align-items:center;gap:3px;margin:0 0 1em;padding:4px;border-radius:12px;background:#eef2f7;border:1px solid #dde3ec;overflow-x:auto;scrollbar-width:thin;-webkit-overflow-scrolling:touch;font-size:0.9rem;line-height:1.2;}",
		".mes-snav *{color:inherit;}",
		"nav.mes-snav a.mes-snav-a{flex:0 0 auto;display:inline-flex;align-items:center;gap:0.42em;padding:0.48em 0.85em;border-radius:9px;text-decoration:none !important;color:#34404f;font-weight:500;white-space:nowrap;transition:background .15s,color .15s;}",
		"nav.mes-snav a.mes-snav-a:hover{background:#dfe7f2;color:#123d73;}",
		"nav.mes-snav a.mes-snav-a:focus-visible{outline:2px solid #1f6fd1;outline-offset:1px;}",
		"nav.mes-snav a.mes-snav-a.is-cur{background:#fff;color:#0f4fa8;font-weight:700;box-shadow:0 1px 3px rgba(15,30,60,.18),inset 0 -2px 0 #1f6fd1;}",
		".mes-snav svg{width:1.05em;height:1.05em;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.85;}",
		".mes-snav .mes-snav-sep{flex:0 0 auto;width:1px;align-self:stretch;margin:6px 4px;background:#c9d2de;}",
		"nav.mes-snav a.mes-snav-a.mes-snav-x{color:#5d6878;font-weight:400;}",
		"nav.mes-snav a.mes-snav-x svg{width:.85em;height:.85em;opacity:.7;}",
		".mes-snav .mes-snav-own{flex:0 0 auto;font-size:.72em;text-transform:uppercase;letter-spacing:.06em;color:#7a8594;padding:0 .2em 0 .3em;}",
		"html body.dark-mode nav.mes-snav{background:#1d2430;border-color:#2e3848;}",
		"html body.dark-mode nav.mes-snav a.mes-snav-a{color:#c5cfdc;}",
		"html body.dark-mode nav.mes-snav a.mes-snav-a:hover{background:#2a3444;color:#ffffff;}",
		"html body.dark-mode nav.mes-snav a.mes-snav-a.is-cur{background:#2f5fa8;color:#ffffff;box-shadow:inset 0 -2px 0 #8cc0ff;}",
		"html body.dark-mode nav.mes-snav a.mes-snav-a.mes-snav-x{color:#9aa6b6;}",
		"html body.dark-mode nav.mes-snav .mes-snav-sep{background:#3a4556;}",
		"html body.dark-mode nav.mes-snav .mes-snav-own{color:#8793a3;}",
		"@media (max-width:600px){.mes-snav{flex-wrap:nowrap;font-size:0.86rem;margin-left:-2px;margin-right:-2px;}.mes-snav a.mes-snav-a{padding:0.5em 0.7em;}}",
		"@media print{.mes-snav{display:none;}}"
	].join("\n");
	if (!document.getElementById("mes-snav-css")) {
		var st = document.createElement("style");
		st.id = "mes-snav-css";
		st.textContent = CSS;
		(document.head || document.documentElement).appendChild(st);
	}
	function svg(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (I[k] || "") + "</svg>"; }
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function build(nav) {
		if (!nav || nav.__snav) return;
		nav.__snav = 1;
		var cur = nav.getAttribute("data-cur") || "";
		var owner = false;
		try { owner = localStorage.getItem("mes-owner") === "1"; } catch (e) {}
		PAGES.forEach(function (p) { if (p[0] === cur && p[3]) owner = true; });
		var extras = [].slice.call(nav.querySelectorAll("a.mes-snav-x")).map(function (a) {
			return { href: a.getAttribute("href"), text: a.textContent.trim(), ext: /^https?:/i.test(a.getAttribute("href") || "") };
		});
		var h = "", sepDone = false;
		PAGES.forEach(function (p) {
			if (p[3] && !owner) return;
			if (p[3] && !sepDone) { h += '<span class="mes-snav-sep" aria-hidden="true"></span>'; sepDone = true; }
			var on = p[0] === cur;
			h += '<a class="mes-snav-a' + (on ? " is-cur" : "") + '" href="' + p[1] + '"' + (on ? ' aria-current="page"' : "") +
				(p[3] ? ' rel="nofollow"' : "") + ">" + svg(p[0]) + "<span>" + esc(p[2]) + "</span></a>";
		});
		if (extras.length) {
			h += '<span class="mes-snav-sep" aria-hidden="true"></span>';
			extras.forEach(function (x) {
				h += '<a class="mes-snav-a mes-snav-x" href="' + esc(x.href) + '"' + (x.ext ? ' target="_blank" rel="noopener"' : "") + "><span>" + esc(x.text) + "</span>" + (x.ext ? svg("x") : "") + "</a>";
			});
		}
		nav.innerHTML = h;
		var c = nav.querySelector(".is-cur");
		if (c && nav.scrollWidth > nav.clientWidth) {
			nav.scrollLeft = Math.max(0, c.offsetLeft - (nav.clientWidth - c.offsetWidth) / 2);
		}
	}
	var me = document.currentScript, prev = me && me.previousElementSibling;
	if (prev && prev.classList && prev.classList.contains("mes-snav")) build(prev);
	function all() { [].forEach.call(document.querySelectorAll("nav.mes-snav"), build); }
	if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", all); else all();
	window.MESStatNav = { build: build };
})();
