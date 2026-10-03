/* MES Solar System Today -- the small widget on mes.fm/moon ("Earth, Moon & the solar system right now").
 * Bundled by build_tool_apps.py as mes.fm/solar-system-today/js/orrery-embed.js (lib.js + view.js + this file). Needs the global `Astronomy`
 * (the moon page already loads it) and a <div id="ssEmbed"> host. A limited version of the full page: two views, play / step / Now, and a link.
 */
(function () {
	"use strict";
	var host = document.getElementById("ssEmbed");
	if (!host || !window.Astronomy || !window.MESSolarView) return;
	var S = window.MESSolar, MV = window.MESSolarView, DAY = 86400000;
	if (!document.getElementById("sseStyle")) {
		var st = document.createElement("style"); st.id = "sseStyle";
		st.textContent =
			".sse-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}" +
			".sse button,.sse select{font:inherit;font-size:0.88em;cursor:pointer;border:1px solid rgba(128,128,128,0.55);background:transparent;color:inherit;border-radius:6px;padding:5px 10px}" +
			".sse button:hover{border-color:#6c8cff}" +
			".sse .sse-tab[aria-pressed=true],.sse .sse-play[aria-pressed=true]{background:#3730a3;border-color:#3730a3;color:#fff}" +
			".sse-stage{position:relative;height:clamp(300px,52vw,420px);border-radius:8px;overflow:hidden;background:#07080b}" +
			".sse-stage canvas{position:absolute;inset:0;width:100%;height:100%;display:block;outline:none}" +
			".sse-date{position:absolute;left:10px;top:8px;color:#e8ecf5;font-weight:700;font-size:1.05em;text-shadow:0 1px 6px #000;pointer-events:none}" +
			".sse-date small{display:block;font-weight:400;font-size:0.72em;color:#9aa5bb}" +
			".sse-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0 0}" +
			".sse-bar .sse-sp{flex:1}" +
			".sse-info{margin:8px 0 0;font-size:0.92em;line-height:1.45}" +
			".sse-link{font-weight:700}";
		document.head.appendChild(st);
	}
	host.className = "sse";
	host.innerHTML =
		'<div class="sse-tabs" role="group" aria-label="View"><button type="button" class="sse-tab" data-v="moon" aria-pressed="true">🌍 Earth &amp; Moon</button><button type="button" class="sse-tab" data-v="orrery" aria-pressed="false">☀ Inner solar system</button><button type="button" class="sse-tab" data-v="outer" aria-pressed="false">Whole solar system</button></div>' +
		'<div class="sse-stage"><canvas tabindex="0" role="img" aria-label="Earth, Moon and the planets for the chosen date"></canvas><div class="sse-date"><span class="sse-big"></span><small class="sse-sub"></small></div></div>' +
		'<div class="sse-bar"><button type="button" class="sse-prev" aria-label="Back one day" title="Back one day">⏮ −1 day</button><button type="button" class="sse-play" aria-pressed="false">▶ Play</button><button type="button" class="sse-next" aria-label="Forward one day" title="Forward one day">+1 day ⏭</button>' +
		'<select class="sse-speed" aria-label="Speed"><option value="1">1 day / s</option><option value="7" selected>1 week / s</option><option value="30.4375">1 month / s</option><option value="365.25">1 year / s</option></select>' +
		'<button type="button" class="sse-now">Now</button><span class="sse-sp"></span><a class="sse-link" href="/solar-system-today">Open the full Solar System Today →</a></div>' +
		'<p class="sse-info" aria-live="polite"></p>';
	var $ = function (c) { return host.querySelector(c); };
	var date = new Date(), playing = false, last = 0, tab = "moon";
	var view = MV.create($("canvas"), { date: date, mode: "moon", fitAU: 1.8, wheel: "ctrl", touchAction: "pan-y", compress: 0.55,
		onPick: function () {} });
	view.V.show.rings = true; view.V.show.halley = false; view.V.show.belts = true;
	function fmt(d) { try { return d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }); } catch (e) { return d.toDateString(); } }
	function clock(d) { try { return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; } }
	function paint(d) {
		$(".sse-big").textContent = fmt(d); $(".sse-sub").textContent = clock(d) + " your time";
		var sn = view.snap(), mi = S.moonInfo(d, sn), e = sn.by.earth;
		$(".sse-info").innerHTML = "<b>" + mi.name + "</b>, " + Math.round(mi.frac * 100) + "% lit, " + Math.round(mi.dist).toLocaleString() + " km from Earth" + (mi.orbit ? " (" + mi.orbit + ")" : "") +
			". Earth is " + S.fmtAU(e.r) + " AU (" + (e.r * 149.5978).toFixed(1) + " million km) from the Sun" + (mi.eclipseWindow ? ". The Moon is near the ecliptic now, so an eclipse is possible at a new or full moon." : ".");
	}
	function setDate(d) { date = d; view.setDate(d); paint(d); }
	function setTab(t) {
		tab = t; Array.prototype.forEach.call(host.querySelectorAll(".sse-tab"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === t)); });
		if (t === "moon") { view.set({ mode: "moon" }); view.V.zoom = 1; view.render(); $(".sse-speed").value = "1"; }
		else { view.setMode("orrery"); view.fit(t === "orrery" ? 1.8 : 36); view.V.compress = t === "orrery" ? 0.4 : 0.72; view.fit(t === "orrery" ? 1.8 : 36); $(".sse-speed").value = t === "orrery" ? "7" : "365.25"; }
		paint(date);
	}
	host.querySelector(".sse-tabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setTab(b.dataset.v); });
	function tick(ts) {
		if (!playing) return;
		if (last) setDate(new Date(+date + Math.min(0.1, (ts - last) / 1000) * (+$(".sse-speed").value) * DAY));
		last = ts; requestAnimationFrame(tick);
	}
	function play(on) { playing = on; last = 0; $(".sse-play").textContent = on ? "❚❚ Pause" : "▶ Play"; $(".sse-play").setAttribute("aria-pressed", String(on)); if (on) requestAnimationFrame(tick); }
	$(".sse-play").onclick = function () { play(!playing); };
	$(".sse-prev").onclick = function () { play(false); setDate(new Date(+date - DAY)); };
	$(".sse-next").onclick = function () { play(false); setDate(new Date(+date + DAY)); };
	$(".sse-now").onclick = function () { play(false); setDate(new Date()); };
	// the section is a collapsible dropdown on the moon page: repaint when it opens (a hidden canvas has no size)
	if (window.IntersectionObserver) new IntersectionObserver(function (en) { if (en[0].isIntersecting) { view.resize(); } }).observe(host);
	paint(date);
	window.MESSolarEmbed = { view: view, setDate: setDate };
})();
