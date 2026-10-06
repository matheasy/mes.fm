/* MESAdQuiet: keep ads out of the way while someone is typing, and for a few seconds after they finish.
   AdSense auto ads (anchor, in-page, vignette) can appear at the instant a test ends, right where the person is still
   tapping / typing, so a stray tap opens the ad. hold() hides every Google ad element on the page and makes it untouchable;
   release(ms) lets them back after a pause (a new hold() cancels a pending release).
   Self-contained: injects its own CSS, no dependencies. Never touches consent dialogs. */
(function () {
	if (window.MESAdQuiet) return;
	var ROOT = document.documentElement, CLS = "mes-ads-quiet", timer = 0;
	var SEL = [
		"ins.adsbygoogle", ".adsbygoogle-noablate", ".google-auto-placed",
		"[id^='google_ads_iframe']", "[id^='aswift']", "[id^='google_ads']", "[id^='gsr']", "[id^='google_vignette']",
		"iframe[src*='googlesyndication']", "iframe[src*='doubleclick']", "[data-vignette-loaded]", "[data-anchor-status]",
		"[data-google-query-id]", ".mes-bottom-ad"
	].map(function (s) { return "html." + CLS + " " + s; }).join(",");
	var st = document.createElement("style");
	st.textContent = SEL + "{display:none!important;visibility:hidden!important;pointer-events:none!important}";
	(document.head || ROOT).appendChild(st);
	function on() { ROOT.classList.add(CLS); }
	function off() { ROOT.classList.remove(CLS); }
	window.MESAdQuiet = {
		hold: function () { clearTimeout(timer); timer = 0; on(); },
		release: function (ms) { clearTimeout(timer); timer = setTimeout(function () { timer = 0; off(); }, ms == null ? 6000 : ms); },
		active: function () { return ROOT.classList.contains(CLS); }
	};
})();
