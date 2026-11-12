/* MES GTA 6 Hub: hub, countdown, download pages + the tabs and jump calculator of the simulator page (the simulator itself is sim.js).
   #gt[data-page] = hub | jump | countdown | download. State: localStorage "mes-gta:v1" (countdown mode / zone, download inputs). */
(function () {
	"use strict";
	var root = document.getElementById("gt"); if (!root || !window.MESGTA) return;
	var M = window.MESGTA, PAGE = root.getAttribute("data-page"), KEY = "mes-gta:v1";
	var $ = function (id) { return document.getElementById(id); };
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var s = sget(); for (var k in o) s[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode */ } }
	function num(v, d) { var x = parseFloat(String(v == null ? "" : v).replace(/\s/g, "").replace(",", ".")); return isFinite(x) ? x : d; }
	function pad(n) { return (n < 10 ? "0" : "") + n; }
	var myTz = (function () { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { return "UTC"; } })();
	function fmtIn(ms, tz, o) { try { return new Intl.DateTimeFormat(undefined, Object.assign({ timeZone: tz }, o)).format(new Date(ms)); } catch (e) { return new Date(ms).toUTCString(); } }
	function whenText(ms, tz) { return fmtIn(ms, tz, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }); }
	function toast(msg) { var t = $("gj-toast"); if (!t) return; t.textContent = msg; t.classList.add("is-on"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("is-on"); }, 3200); }
	function copy(text, msg) { (navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { toast(msg); }, function () { prompt("Copy this:", text); }); }
	function srcLine(el) { if (!el) return; el.innerHTML = "Checked " + M.FACTS.checked + ": " + M.FACTS.sources.map(function (s) { return '<a href="' + s[1] + '" target="_blank" rel="noopener">' + esc(s[0]) + "</a>"; }).join(" · ") + "."; }

	/* ---------------- equation boxes: scale each typeset formula down to fit its box (no scroll bars) ---------------- */
	(function () {
		var els = Array.prototype.slice.call(root.querySelectorAll(".gj-eq__f")); if (!els.length) return;
		function fit() {
			els.forEach(function (e) {
				var c = e.querySelector("mjx-container"); if (!c || !e.clientWidth) return;
				e.style.fontSize = "";
				var avail = e.clientWidth - 2, w = c.getBoundingClientRect().width;
				if (w > avail) e.style.fontSize = (1.05 * avail / w).toFixed(3) + "em";
			});
		}
		if (window.MutationObserver) els.forEach(function (e) { new MutationObserver(fit).observe(e, { attributes: true, attributeFilter: ["class"], childList: true }); });
		if (window.ResizeObserver) { var lw = 0; new ResizeObserver(function () { var w = root.clientWidth; if (Math.abs(w - lw) > 4) { lw = w; fit(); } }).observe(root); }
		else window.addEventListener("resize", fit);
		var mc = document.getElementById("main-content");
		if (mc && window.MutationObserver) new MutationObserver(function () { setTimeout(fit, 30); }).observe(mc, { attributes: true, attributeFilter: ["style", "class"] });
		window.addEventListener("resize", function () { setTimeout(fit, 50); });
		fit();
	})();

	/* ---------------- tabs (simulator page) ---------------- */
	var tabs = root.querySelector(".gt-tabs");
	if (tabs) {
		var setTab = function (t, push) {
			Array.prototype.forEach.call(tabs.querySelectorAll("[data-tab]"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
			Array.prototype.forEach.call(root.querySelectorAll("[data-panel]"), function (p) { p.hidden = p.getAttribute("data-panel") !== t; });
			if (push) { var u = new URL(location.href); if (t === "sim") u.searchParams.delete("tab"); else u.searchParams.set("tab", t); history.replaceState(null, "", u); }
			window.dispatchEvent(new Event("resize")); if (t === "calc") calc();
		};
		tabs.addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (b) setTab(b.getAttribute("data-tab"), true); });
		var qt = new URLSearchParams(location.search).get("tab"); if (qt === "calc") setTimeout(function () { setTab("calc"); }, 0); /* after the calculator below is set up */
	}

	/* ---------------- jump calculator ---------------- */
	var DRAGS = [["none", "No air (vacuum)", 0], ["car", "Car (Cd·A 0.65 m², 1,400 kg)", 0.5 * 1.2 * 0.65 / 1400], ["bike", "Motorbike + rider (0.45 m², 280 kg)", 0.5 * 1.2 * 0.45 / 280], ["truck", "Big truck (2.6 m², 5,000 kg)", 0.5 * 1.2 * 2.6 / 5000], ["person", "A person (0.7 m², 80 kg)", 0.5 * 1.2 * 0.7 / 80]];
	function calc() {
		if (!$("jc-out")) return;
		var vu = $("jc-vu").value, v = num($("jc-v").value, NaN) * (vu === "kmh" ? 1 / 3.6 : vu === "mph" ? 0.44704 : 1), th = num($("jc-a").value, NaN), hu = $("jc-hu").value, hf = hu === "ft" ? 0.3048 : 1;
		var h = num($("jc-h").value, 0) * hf, x = num($("jc-x").value, 0) * hf, g = num($("jc-g").value, 9.80665), dk = DRAGS.filter(function (d) { return d[0] === $("jc-drag").value; })[0], k = dk ? dk[2] : 0;
		$("jc-xu").textContent = hu; sset({ jc: [$("jc-v").value, vu, $("jc-a").value, $("jc-h").value, hu, $("jc-x").value, $("jc-drag").value, $("jc-g").value] });
		var out = $("jc-out");
		if (!(v > 0) || !isFinite(th) || th < -45 || th > 85) { out.innerHTML = '<div class="tu-card gj-calcerr">Type a speed and an angle between −45° and 85°.</div>'; return; }
		var p = M.projectile(v, th, h, g), d = M.dragFlight(v, th, h, k, g, true), need = x > 0 ? M.speedNeeded(x, th, h, g) : NaN, needD = x > 0 && k ? M.speedNeededDrag(x, th, h, k, g) : need, best = M.bestAngle(v, h, g);
		function L(m) { return hu === "ft" ? (m / 0.3048).toFixed(1) + " ft" : m.toFixed(1) + " m"; }
		function V(ms) { return vu === "mph" ? (ms / 0.44704).toFixed(1) + " mph" : vu === "ms" ? ms.toFixed(1) + " m/s" : (ms * 3.6).toFixed(1) + " km/h"; }
		function tile(l, a, s, cls) { return '<div class="gj-tile' + (cls ? " gj-tile--" + cls : "") + '"><span>' + l + "</span><b>" + a + "</b>" + (s ? "<small>" + s + "</small>" : "") + "</div>"; }
		if (!p) { out.innerHTML = '<div class="tu-card gj-calcerr">It never gets that high: the landing is above the top of the jump.</div>'; return; }
		var r = k ? d : p, clears = x > 0 ? r.x >= x : null;
		var html = '<div class="gj-tiles">' +
			tile("Distance", L(r.x), k ? "no air: " + L(p.x) : "on the landing level") +
			tile("Airtime", r.t.toFixed(2) + " s", k ? "no air: " + p.t.toFixed(2) + " s" : "") +
			tile("Highest point", L(k ? d.apex : p.apex), "above the lip") +
			tile("Landing speed", V(r.vLand), "at " + Math.abs(r.angLand).toFixed(0) + "° down") +
			(x > 0 ? tile("Clears " + L(x) + "?", clears ? "Yes" : "No", clears ? "with " + L(r.x - x) + " to spare" : "short by " + L(x - r.x), clears ? "ok" : "bad") : "") +
			(x > 0 ? tile("Speed needed", isFinite(needD) ? V(needD) : "impossible", isFinite(need) && k ? "no air: " + V(need) : "") : "") +
			tile("Best angle at this speed", best.toFixed(1) + "°", "longest jump (no air)") + "</div>";
		out.innerHTML = html;
		/* chart */
		var c = $("jc-c"), dpr = Math.min(2, window.devicePixelRatio || 1), w = c.parentNode.clientWidth || 600, hh = Math.max(220, Math.round(w / 2.6));
		c.style.height = hh + "px"; c.width = Math.round(w * dpr); c.height = Math.round(hh * dpr); var ctx = c.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		var dk2 = document.body.classList.contains("dark-mode"), bg = dk2 ? "#16181f" : "#fff", grid = dk2 ? "#2c313c" : "#e6e9ee", text = dk2 ? "#c9ced6" : "#4a5260";
		ctx.fillStyle = bg; ctx.fillRect(0, 0, w, hh);
		var vac = M.dragFlight(v, th, h, 0, g, true).path, xmax = Math.max(p.x, x, 1) * 1.08, ymax = Math.max(p.apex, 0.5) * 1.15, ymin = Math.min(-h, 0) - 0.5;
		var Lm = 46, Rm = 10, T = 10, B = 28, cw = w - Lm - Rm, ch = hh - T - B, s = Math.min(cw / xmax, ch / (ymax - ymin));
		function X(v2) { return Lm + v2 * s; } function Y(v2) { return T + (ymax - v2) * s; }
		ctx.strokeStyle = grid; ctx.fillStyle = text; ctx.font = "11px system-ui,sans-serif"; ctx.lineWidth = 1;
		var step = Math.pow(10, Math.floor(Math.log10(xmax / 4))); if (xmax / step > 10) step *= 2; if (xmax / step > 10) step *= 2.5;
		for (var gx = 0; gx <= xmax; gx += step) { ctx.beginPath(); ctx.moveTo(X(gx), T); ctx.lineTo(X(gx), T + ch); ctx.stroke(); ctx.textAlign = "center"; ctx.fillText(L(gx).replace(".0 ", " "), X(gx), T + ch + 15); }
		ctx.fillStyle = dk2 ? "#3a3346" : "#e9e3f2"; ctx.fillRect(X(-0.5), Y(0), X(0) - X(-0.5) + 2, Y(ymin) - Y(0)); ctx.fillRect(X(x || p.x), Y(-h), w, Y(ymin) - Y(-h) + 40);
		if (x > 0) { ctx.strokeStyle = "#22b35a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(x), Y(-h)); ctx.lineTo(X(xmax), Y(-h)); ctx.stroke(); }
		function line(path, col, dash) { ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.setLineDash(dash || []); ctx.beginPath(); path.forEach(function (q, i) { if (i) ctx.lineTo(X(q[0]), Y(q[1])); else ctx.moveTo(X(q[0]), Y(q[1])); }); ctx.stroke(); ctx.setLineDash([]); }
		line(vac, "#7a8699", k ? [5, 5] : null); if (k) line(d.path, "#c2185b");
	}
	if ($("jc-out")) {
		var ds = $("jc-drag"); DRAGS.forEach(function (d) { var o = document.createElement("option"); o.value = d[0]; o.textContent = d[1]; ds.appendChild(o); }); ds.value = "car";
		var jc = sget().jc; if (jc && jc.length === 8) { $("jc-v").value = jc[0]; $("jc-vu").value = jc[1]; $("jc-a").value = jc[2]; $("jc-h").value = jc[3]; $("jc-hu").value = jc[4]; $("jc-x").value = jc[5]; $("jc-drag").value = jc[6]; $("jc-g").value = jc[7]; }
		["jc-v", "jc-vu", "jc-a", "jc-h", "jc-hu", "jc-x", "jc-drag", "jc-g"].forEach(function (id) { $(id).addEventListener("input", calc); $(id).addEventListener("change", calc); });
		window.addEventListener("resize", function () { if (!$("jc-out").closest("[hidden]")) calc(); });
	}

	/* ---------------- shared countdown maths ---------------- */
	var REL = M.FACTS.release, PRE = M.FACTS.preload;
	function countParts(target) { return M.parts(target - Date.now()); }

	/* ---------------- hub ---------------- */
	if (PAGE === "hub") {
		var target = M.midnight(myTz, REL);
		(function tick() {
			var p = countParts(target); $("gh-d").textContent = p.d; $("gh-h").textContent = pad(p.h); $("gh-m").textContent = pad(p.m); $("gh-s").textContent = pad(p.s);
			if (p.total <= 0) $("gh-cdl").textContent = "It's out! Unlocked at midnight where you are.";
			setTimeout(tick, 1000 - Date.now() % 1000 + 5);
		})();
		srcLine($("gh-src"));
		var allNews = [], shown = 8;
		function paintNews() {
			var ul = $("gh-news"); if (!allNews.length) { ul.innerHTML = '<li class="gh-load">No GTA headlines right now. Check back soon.</li>'; $("gh-more").hidden = true; return; }
			ul.innerHTML = allNews.slice(0, shown).map(function (n) { var ago = n.date ? agoText(n.date) : ""; return '<li><a href="' + esc(n.link) + '" target="_blank" rel="noopener nofollow">' + esc(n.title) + '</a><span>' + esc(n.source) + (ago ? " · " + ago : "") + "</span></li>"; }).join("");
			$("gh-more").hidden = shown >= allNews.length;
		}
		function agoText(ms) { var s = (Date.now() - ms) / 1000; if (s < 3600) return Math.max(1, Math.round(s / 60)) + " min ago"; if (s < 86400) return Math.round(s / 3600) + " h ago"; var d = Math.round(s / 86400); return d === 1 ? "yesterday" : d + " days ago"; }
		$("gh-more").addEventListener("click", function () { shown += 12; paintNews(); });
		var local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || new URLSearchParams(location.search).has("mock");
		fetch(local ? "/gta/data/news-sample.json" : "/api/gta-news").then(function (r) { if (!r.ok) throw 0; return r.json(); }).then(function (d) { allNews = (d.items || []).filter(function (n) { return /^https?:\/\//.test(n.link); }); paintNews(); })
			.catch(function () { $("gh-news").innerHTML = '<li class="gh-load">Could not load the headlines right now.</li>'; $("gh-more").hidden = true; });

		/* GTA Radio: the list is static HTML (data-3s / data-yt / data-sp on each button); nothing loads from 3Speak / YouTube / Spotify until Play. */
		(function () {
			var list = $("gm-list"); if (!list) return;
			var SRC = {"3s": "3Speak", yt: "YouTube", sp: "Spotify"}, cur = null, src = null, mkey = "mes-gta:music";
			function pick(b) { var o = {}; try { o = JSON.parse(localStorage.getItem(mkey) || "{}"); } catch (e) {} return b.getAttribute("data-" + o.src) ? o.src : (b.dataset["3s"] ? "3s" : "yt"); }
			function url(k, v) {
				if (k === "3s") return "https://play.3speak.tv/embed?v=" + encodeURIComponent(v).replace("%2F", "/") + "&autoplay=true";
				if (k === "yt") return "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(v) + "?autoplay=1&rel=0";
				return "https://open.spotify.com/embed/album/" + encodeURIComponent(v) + "?utm_source=generator&theme=0";
			}
			function link(t, h) { return h ? '<a href="' + esc(h) + '" target="_blank" rel="noopener">' + t + "</a>" : ""; }
			function show(b, play) {
				cur = b; src = pick(b);
				[].forEach.call(list.querySelectorAll(".gm-item"), function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
				$("gm-title").textContent = b.querySelector("b").textContent; $("gm-note").textContent = b.getAttribute("data-note") || "";
				var d = b.dataset, seg = "";
				["3s", "yt", "sp"].forEach(function (k) { if (d[k]) seg += '<button type="button" data-k="' + k + '" aria-pressed="' + (k === src) + '">' + SRC[k] + "</button>"; });
				$("gm-src").innerHTML = seg; $("gm-src").hidden = seg.split("<button").length < 3;
				$("gm-links").innerHTML = [link("Hive post", d.hive), d["3s"] && link("3Speak", "https://3speak.tv/watch?v=" + d["3s"]), d.yt && link("YouTube", "https://www.youtube.com/watch?v=" + d.yt), d.sp && link("Spotify", "https://open.spotify.com/album/" + d.sp), link("Apple Music", d.apple), link("Amazon Music", d.amazon), link("Deezer", d.deezer)].filter(Boolean).join(" · ");
				if (play) load(); else poster();
			}
			function poster() {
				var img = cur.querySelector("img").getAttribute("src").replace("/320x0/", "/640x0/").replace("/mqdefault.", "/hqdefault.");
				$("gm-screen").className = "gm-screen";
				$("gm-screen").innerHTML = '<button type="button" class="gm-poster" id="gm-poster"><img src="' + esc(img) + '" alt=""><span class="gm-play" aria-hidden="true">▶</span><span class="gm-ptxt">Play on ' + SRC[src] + "</span></button>";
				$("gm-poster").addEventListener("click", load);
			}
			function load() {
				var v = cur.dataset[src], sp = src === "sp";
				$("gm-screen").className = "gm-screen" + (sp ? " is-sp" : "");
				$("gm-screen").innerHTML = '<iframe src="' + esc(url(src, v)) + '" title="' + esc(cur.querySelector("b").textContent) + '" allow="autoplay; encrypted-media; fullscreen; picture-in-picture; clipboard-write" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe>';
			}
			list.addEventListener("click", function (e) { var b = e.target.closest(".gm-item"); if (b) show(b, cur !== b || !$("gm-screen").querySelector("iframe")); });
			$("gm-src").addEventListener("click", function (e) {
				var b = e.target.closest("button[data-k]"); if (!b) return;
				try { localStorage.setItem(mkey, JSON.stringify({src: b.getAttribute("data-k")})); } catch (er) {}
				var playing = !!$("gm-screen").querySelector("iframe"); show(cur, playing);
			});
			show(list.querySelector(".gm-item"), false);
		})();
	}

	/* ---------------- countdown ---------------- */
	if (PAGE === "countdown") {
		var st = sget(), q = new URLSearchParams(location.search), CM = { mode: q.get("mode") || st.cmode || "local", zone: q.get("tz") || st.czone || "Pacific/Auckland" };
		if (!/^(local|first|zone)$/.test(CM.mode)) CM.mode = "local";
		var zsel = $("gc-zone"), zones = M.CITIES.slice();
		if (!zones.some(function (z) { return z[1] === myTz; })) zones.unshift([myTz.split("/").pop().replace(/_/g, " ") + " (you)", myTz]);
		zones.forEach(function (z) { var o = document.createElement("option"); o.value = z[1]; o.textContent = z[0] + " (" + z[1] + ")"; zsel.appendChild(o); });
		if (!zones.some(function (z) { return z[1] === CM.zone; })) { var o = document.createElement("option"); o.value = CM.zone; o.textContent = CM.zone; zsel.appendChild(o); }
		zsel.value = CM.zone;
		function targetTz() { return CM.mode === "first" ? "Pacific/Auckland" : CM.mode === "zone" ? CM.zone : myTz; }
		function tgt() { return M.midnight(targetTz(), REL); }
		function paintMode() {
			Array.prototype.forEach.call($("gc-mode").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === CM.mode ? "true" : "false"); });
			$("gc-zonef").hidden = CM.mode !== "zone"; sset({ cmode: CM.mode, czone: CM.zone }); world(); links();
		}
		$("gc-mode").addEventListener("click", function (e) { var b = e.target.closest("[data-v]"); if (!b) return; CM.mode = b.getAttribute("data-v"); paintMode(); tick(true); });
		zsel.addEventListener("change", function () { CM.zone = zsel.value; paintMode(); tick(true); });
		var announced = Date.UTC(2023, 11, 5); /* first trailer: the progress bar runs from there to launch */
		function tick(once) {
			var t = tgt(), p = countParts(t), tz = targetTz();
			$("gc-d").textContent = p.d; $("gc-h").textContent = pad(p.h); $("gc-m").textContent = pad(p.m); $("gc-s").textContent = pad(p.s);
			var label = CM.mode === "first" ? "GTA 6 unlocks first in New Zealand in" : CM.mode === "zone" ? "GTA 6 unlocks in " + zsel.options[zsel.selectedIndex].text.replace(/ \(.*/, "") + " in" : "GTA 6 unlocks where you are in";
			if (p.total <= 0) { label = "GTA 6 is out!"; var since = Math.floor((Date.now() - t) / 86400000); $("gc-when").textContent = since >= 1 ? "Day " + (since + 1) + " since it unlocked." : "It unlocked at midnight."; }
			else $("gc-when").textContent = "That is " + whenText(t, myTz) + " your time" + (tz !== myTz ? " (midnight on Nov 19 in " + tz.split("/").pop().replace(/_/g, " ") + ")" : " (midnight)") + ".";
			$("gc-what").textContent = label;
			$("gc-prog").style.width = Math.max(0, Math.min(100, (Date.now() - announced) / (t - announced) * 100)).toFixed(3) + "%";
			var pre = M.midnight(myTz, PRE), pp = countParts(pre);
			$("gc-pre").textContent = pp.total > 0 ? "Preload opens " + fmtIn(pre, myTz, { weekday: "long", month: "long", day: "numeric" }) + ": " + pp.d + " days " + pp.h + " hours away (the date is official, the hour may vary by store)." : "Preload is open: you can download it now and it unlocks on the 19th.";
			if (!once) setTimeout(tick, 1000 - Date.now() % 1000 + 5);
		}
		function world() {
			var tb = $("gc-world"), rows = M.CITIES.map(function (c) { return [c[0], c[1], M.midnight(c[1], REL)]; }).sort(function (a, b) { return a[2] - b[2]; });
			tb.innerHTML = rows.map(function (r) { var mine = r[1] === myTz; return "<tr" + (mine ? ' class="gc-me"' : "") + "><td>" + esc(r[0]) + (mine ? " <small>(you)</small>" : "") + "</td><td>" + esc(fmtIn(r[2], myTz, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })) + '</td><td data-t="' + r[2] + '"></td></tr>'; }).join("");
			refreshWorld();
		}
		function refreshWorld() { Array.prototype.forEach.call($("gc-world").querySelectorAll("td[data-t]"), function (td) { var p = countParts(+td.getAttribute("data-t")); td.textContent = p.total <= 0 ? "out now" : p.d + "d " + p.h + "h " + p.m + "m"; }); }
		setInterval(refreshWorld, 30000);
		function links() {
			var tz = targetTz(), title = "GTA 6 unlocks";
			$("gc-remind").href = "/reminder?title=" + encodeURIComponent(title) + "&t=" + REL + "T00:00&tz=" + encodeURIComponent(tz) + "&u=/gta-6-countdown";
			var t = tgt(), d = new Date(t), e = new Date(t + 3600000), f = function (x) { return x.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""); };
			$("gc-gcal").href = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) + "&dates=" + f(d) + "/" + f(e) + "&details=" + encodeURIComponent("Countdown: https://mes.fm/gta-6-countdown");
		}
		$("gc-ics").addEventListener("click", function () {
			var t = tgt(), f = function (x) { return new Date(x).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""); };
			var ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MES//GTA 6 Countdown//EN", "BEGIN:VEVENT", "UID:gta6-" + t + "@mes.fm", "DTSTAMP:" + f(Date.now()), "DTSTART:" + f(t), "DTEND:" + f(t + 3600000), "SUMMARY:GTA 6 unlocks", "DESCRIPTION:Countdown: https://mes.fm/gta-6-countdown", "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:GTA 6 unlocks in 15 minutes", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
			var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "gta-6-unlock.ics"; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
		});
		$("gc-share").addEventListener("click", function () { var u = location.origin + location.pathname + (CM.mode === "local" ? "" : "?mode=" + CM.mode + (CM.mode === "zone" ? "&tz=" + encodeURIComponent(CM.zone) : "")); copy(u, "Link copied."); });
		/* fill window / full screen (Esc closes) */
		var box = $("gc-box");
		function setFill(on) { box.classList.toggle("gc-filled", on); document.documentElement.classList.toggle("gc-fill-on", on); $("gc-fill").textContent = on ? "✕ Close (Esc)" : "⤢ Fill window"; }
		$("gc-fill").addEventListener("click", function () { setFill(!box.classList.contains("gc-filled")); });
		$("gc-fs").addEventListener("click", function () { if (document.fullscreenElement) document.exitFullscreen(); else if (box.requestFullscreen) box.requestFullscreen().catch(function () { setFill(true); }); else setFill(true); });
		document.addEventListener("keydown", function (e) { if (e.target.closest && e.target.closest("input,select,textarea")) return; if (e.key === "Escape" && box.classList.contains("gc-filled")) setFill(false); else if ((e.key === "w" || e.key === "W") && !e.ctrlKey && !e.metaKey) setFill(!box.classList.contains("gc-filled")); else if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey) $("gc-fs").click(); });
		srcLine($("gc-src")); paintMode(); tick();
	}

	/* ---------------- download time + storage ---------------- */
	if (PAGE === "download") {
		var ds0 = sget().dl || {}, qd = new URLSearchParams(location.search);
		if (qd.get("mbps")) { ds0.spd = qd.get("mbps"); ds0.unit = "mbps"; }
		["size", "patch", "spd"].forEach(function (k) { if (ds0[k] != null) $("gd-" + k).value = ds0[k]; }); if (ds0.unit) $("gd-unit").value = ds0.unit; if (ds0.eff) $("gd-eff").value = ds0.eff;
		var con = $("gd-con"); M.CONSOLES.forEach(function (c) { var o = document.createElement("option"); o.value = c.id; o.textContent = c.name; con.appendChild(o); }); con.value = ds0.con || "ps5";
		$("gd-free").value = ds0.free != null ? ds0.free : M.CONSOLES.filter(function (c) { return c.id === con.value; })[0].usable;
		var chips = $("gd-chips"); M.CONNECTIONS.forEach(function (c) { var b = document.createElement("button"); b.type = "button"; b.className = "gj-chip"; b.textContent = c[0] + " · " + (c[1] >= 1000 ? c[1] / 1000 + " Gbps" : c[1] + " Mbps"); b.setAttribute("data-mbps", c[1]); chips.appendChild(b); });
		chips.addEventListener("click", function (e) { var b = e.target.closest("[data-mbps]"); if (!b) return; $("gd-spd").value = b.getAttribute("data-mbps"); $("gd-unit").value = "mbps"; dl(); });
		function gb() { return Math.max(0, num($("gd-size").value, 212)) + Math.max(0, num($("gd-patch").value, 0)); }
		function mbpsNow() { var s = num($("gd-spd").value, 0), u = $("gd-unit").value; return s * M.SPEED_UNITS[u][0] / 1e6; }
		function dl() {
			var size = gb(), sp = num($("gd-spd").value, 0), unit = $("gd-unit").value, eff = num($("gd-eff").value, 0.75), sec = M.downloadSeconds(size, sp, unit, eff), raw = M.downloadSeconds(size, sp, unit, 1);
			sset({ dl: { size: $("gd-size").value, patch: $("gd-patch").value, spd: $("gd-spd").value, unit: unit, eff: $("gd-eff").value, con: con.value, free: $("gd-free").value } });
			var out = $("gd-out");
			if (!(sp > 0) || !(size > 0)) { out.innerHTML = '<div class="tu-card">Type your internet speed above.</div>'; return; }
			var now = Date.now(), fin = now + sec * 1000, pre = M.midnight(myTz, PRE), rel = M.midnight(myTz, REL), finPre = Math.max(now, pre) + sec * 1000;
			var mbs = mbpsNow() * eff / 8;
			function t(l, a, s, cls) { return '<div class="gj-tile' + (cls ? " gj-tile--" + cls : "") + '"><span>' + l + "</span><b>" + a + "</b>" + (s ? "<small>" + s + "</small>" : "") + "</div>"; }
			out.innerHTML = '<div class="gj-tiles">' +
				t("Download time", M.durationText(sec), "at about " + mbs.toFixed(mbs < 10 ? 1 : 0) + " MB/s real speed", "big") +
				t("Best case", M.durationText(raw), "if you got the plan's full speed") +
				t("Start now, done", fmtIn(fin, myTz, { weekday: "short", hour: "numeric", minute: "2-digit" }), "your time") +
				t("Start at preload, done", fmtIn(finPre, myTz, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }), finPre < rel ? "ready before launch" : "after it unlocks", finPre < rel ? "ok" : "bad") +
				t("Data used", size.toFixed(0) + " GB", "≈ " + Math.round(size / 1200 * 100) + "% of a 1.2 TB monthly cap") + "</div>";
			/* other speeds */
			var rows = M.CONNECTIONS.map(function (c) { return [c[0], c[1], M.downloadSeconds(size, c[1], "mbps", eff)]; }), mine = mbpsNow(), maxS = Math.min(rows[0][2], 3 * 86400);
			rows.push(["Your speed", mine, sec]); rows.sort(function (a, b) { return a[1] - b[1]; });
			$("gd-bars").innerHTML = rows.map(function (r) { var you = r[0] === "Your speed"; return '<div class="gd-bar' + (you ? " gd-bar--you" : "") + '"><span>' + esc(r[0]) + " <small>" + (r[1] >= 1000 ? (r[1] / 1000).toFixed(1) + " Gbps" : Math.round(r[1]) + " Mbps") + '</small></span><i style="width:' + Math.max(1.5, Math.min(100, r[2] / maxS * 100)).toFixed(1) + '%"></i><b>' + M.durationText(r[2]) + "</b></div>"; }).join("");
			store();
		}
		function store() {
			var c = M.CONSOLES.filter(function (x) { return x.id === con.value; })[0], free = Math.max(0, num($("gd-free").value, c.usable)), need = gb(), used = Math.max(0, c.usable - free), spare = free - need;
			var pct = function (x) { return Math.max(0, Math.min(100, x / c.usable * 100)).toFixed(1) + "%"; };
			$("gd-disk").innerHTML = '<div class="gd-diskbar"><i class="gd-used" style="width:' + pct(used) + '" title="Already used"></i><i class="gd-game' + (spare < 0 ? " gd-over" : "") + '" style="width:' + pct(Math.min(need, free)) + '" title="GTA 6"></i></div><div class="gj-lg"><span><i style="background:#8a93a6"></i>already used ' + Math.round(used) + ' GB</span><span><i style="background:#c2185b"></i>GTA 6 ' + Math.round(need) + " GB</span><span>space for games " + c.usable + " GB (of " + (c.total >= 1000 ? c.total / 1000 + " TB" : c.total + " GB") + " advertised)</span></div>";
			$("gd-fit").innerHTML = spare >= 50 ? "<b>✓ It fits</b>, with " + Math.round(spare) + " GB to spare." : spare >= 0 ? "<b>It just fits</b> (" + Math.round(spare) + " GB left), but updates need room too: free up about " + Math.round(50 - spare) + " GB more." : "<b>✕ It doesn't fit yet.</b> Free up at least <b>" + Math.round(-spare) + " GB</b> (better " + Math.round(-spare + 50) + " GB for updates), or add storage: an M.2 SSD on PS5, an expansion card on Xbox.";
			$("gd-fit").className = "gd-fit gd-fit--" + (spare >= 50 ? "ok" : spare >= 0 ? "warn" : "bad");
		}
		con.addEventListener("change", function () { $("gd-free").value = M.CONSOLES.filter(function (c) { return c.id === con.value; })[0].usable; dl(); });
		["gd-size", "gd-patch", "gd-spd", "gd-unit", "gd-eff", "gd-free"].forEach(function (id) { $(id).addEventListener("input", dl); $(id).addEventListener("change", dl); });
		/* speed test: timed download from Cloudflare's speed endpoint (CORS-open), up to 50 MB or 8 s */
		$("gd-test").addEventListener("click", function () {
			var btn = this, note = $("gd-testn"); btn.disabled = true; note.textContent = "Testing…";
			var t0 = performance.now(), got = 0, ctl = window.AbortController ? new AbortController() : null, stop = setTimeout(function () { ctl && ctl.abort(); }, 8000);
			fetch("https://speed.cloudflare.com/__down?bytes=50000000&r=" + Math.random(), { cache: "no-store", signal: ctl ? ctl.signal : undefined }).then(function (r) {
				if (!r.body || !r.body.getReader) return r.arrayBuffer().then(function (b) { got = b.byteLength; });
				var rd = r.body.getReader(); return (function pump() { return rd.read().then(function (x) { if (x.done) return; got += x.value.length; var dt = (performance.now() - t0) / 1000; note.textContent = "Testing… " + (got * 8 / dt / 1e6).toFixed(0) + " Mbps"; return pump(); }); })();
			}).catch(function () { /* aborted after 8 s: use what arrived */ }).then(function () {
				clearTimeout(stop); var dt = (performance.now() - t0) / 1000, mbps = got * 8 / dt / 1e6; btn.disabled = false;
				if (got < 1e6) { note.textContent = "The test could not run (blocked or offline). Try fast.com or your provider's speed test."; return; }
				$("gd-spd").value = Math.round(mbps); $("gd-unit").value = "mbps"; $("gd-eff").value = "0.92"; dl();
				note.textContent = "About " + Math.round(mbps) + " Mbps in this browser. A console on the same connection may differ, especially over Wi-Fi.";
			});
		});
		dl();
	}
})();
