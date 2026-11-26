/* MES apps navigation strip (2026-11-25).
   One row that ties the "what can I use" hub pages together, like stat-nav.js does for /stats, /ads, /seo:
   Calculators · Tools · Games · Simulators · Mobile Apps · Extensions · All.
   Used on /calculators, /tools, /games, /simulators, /mobile-apps, /browser and /all.

   Markup (put it at the top of the page content, then load this script right after it, NOT deferred):
     <nav class="mes-anav" data-cur="tools" aria-label="MES apps"><a href="/calculators">Calculators</a> ... </nav>
     <script src="/main_js/apps-nav.js"></script>
   The plain links are the no-JavaScript fallback; this script rebuilds the strip from PAGES with icons and
   marks the current page. build_all_apps.py writes the markup (NAV_HTML) on the pages it manages. */
(function () {
	"use strict";
	var I = {
		calculators: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M8 6h8M8 11h2M12 11h0M16 11h0M8 15h2M12 15h0M16 15v3M8 18.5h4"/>',
		tools: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
		games: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 10.5v4M5 12.5h4"/><circle cx="15.5" cy="11.5" r=".6"/><circle cx="18" cy="13.8" r=".6"/>',
		simulators: '<circle cx="12" cy="12" r="2"/><ellipse cx="12" cy="12" rx="10" ry="4"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(120 12 12)"/>',
		apps: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
		extensions: '<path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3z"/>',
		all: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
	};
	var PAGES = [
		["calculators", "/calculators", "Calculators"],
		["tools", "/tools", "Tools"],
		["games", "/games", "Games"],
		["simulators", "/simulators", "Simulators"],
		["apps", "/mobile-apps", "Mobile Apps"],
		["extensions", "/browser", "Extensions"],
		["all", "/all", "All apps"]
	];
	var CSS = [
		".mes-anav{display:flex;flex-wrap:wrap;align-items:center;gap:3px;margin:0 0 1em;padding:4px;border-radius:12px;background:#eef2f7;border:1px solid #dde3ec;font-size:0.9rem;line-height:1.2;}",
		".mes-anav *{color:inherit;}",
		"nav.mes-anav a.mes-anav-a{flex:0 0 auto;display:inline-flex;align-items:center;gap:0.42em;padding:0.48em 0.85em;border-radius:9px;text-decoration:none !important;color:#34404f !important;font-weight:500;white-space:nowrap;transition:background .15s,color .15s;}",
		"nav.mes-anav a.mes-anav-a:hover{background:#dfe7f2;color:#123d73 !important;}",
		"nav.mes-anav a.mes-anav-a:focus-visible{outline:2px solid #1f6fd1;outline-offset:1px;}",
		"nav.mes-anav a.mes-anav-a.is-cur{background:#fff;color:#0f4fa8 !important;font-weight:700;box-shadow:0 1px 3px rgba(15,30,60,.18),inset 0 -2px 0 #1f6fd1;}",
		".mes-anav svg{width:1.05em;height:1.05em;flex:0 0 auto;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.85;}",
		".mes-anav .mes-anav-sep{flex:0 0 auto;width:1px;align-self:stretch;margin:6px 4px;background:#c9d2de;}",
		"html body.dark-mode nav.mes-anav{background:#1d2430;border-color:#2e3848;}",
		"html body.dark-mode nav.mes-anav a.mes-anav-a{color:#c5cfdc !important;}",
		"html body.dark-mode nav.mes-anav a.mes-anav-a:hover{background:#2a3444;color:#ffffff !important;}",
		"html body.dark-mode nav.mes-anav a.mes-anav-a.is-cur{background:#2f5fa8;color:#ffffff !important;box-shadow:inset 0 -2px 0 #8cc0ff;}",
		"html body.dark-mode nav.mes-anav .mes-anav-sep{background:#3a4556;}",
		/* phones: one row that scrolls sideways instead of three wrapped rows */
		"@media (max-width:600px){.mes-anav{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;-webkit-overflow-scrolling:touch;font-size:0.86rem;}nav.mes-anav a.mes-anav-a{padding:0.5em 0.7em;}}",
		"@media print{.mes-anav{display:none;}}"
	].join("\n");
	if (!document.getElementById("mes-anav-css")) {
		var st = document.createElement("style");
		st.id = "mes-anav-css";
		st.textContent = CSS;
		(document.head || document.documentElement).appendChild(st);
	}
	function svg(k) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + (I[k] || "") + "</svg>"; }
	function build(nav) {
		if (!nav || nav.__anav) return;
		nav.__anav = 1;
		var cur = nav.getAttribute("data-cur") || "";
		var h = "";
		PAGES.forEach(function (p) {
			if (p[0] === "all") h += '<span class="mes-anav-sep" aria-hidden="true"></span>';
			var on = p[0] === cur;
			h += '<a class="mes-anav-a' + (on ? " is-cur" : "") + '" href="' + p[1] + '"' + (on ? ' aria-current="page"' : "") +
				">" + svg(p[0]) + "<span>" + p[2] + "</span></a>";
		});
		nav.innerHTML = h;
		var c = nav.querySelector(".is-cur");
		if (c && nav.scrollWidth > nav.clientWidth) try { nav.scrollLeft = c.offsetLeft - 40; } catch (e) {}
	}
	Array.prototype.forEach.call(document.querySelectorAll("nav.mes-anav"), build);
})();
