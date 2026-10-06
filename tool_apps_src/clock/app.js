/* MES Clock -- mes.fm/clock (UI; helpers in lib.js, global CK). Digital / analog clock for any time zone, themes, full screen with the screen kept awake, up to eight
 * world clocks. State: localStorage "mes-clock:v1". Links: ?tz=Asia/Tokyo&mode=analog|digital|both&h=12|24&theme=night&sec=0.
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("ck");
	if (!root || !window.CK || !window.Intl) return;
	var KEY = "mes-clock:v1", BASE_TITLE = document.title, LOCAL = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
	var THEMES = [["auto", "Auto", "#ffffff"], ["dark", "Dark", "#161a22"], ["night", "Night red", "#000000"], ["green", "Green", "#031a07"], ["amber", "Amber", "#140c00"], ["blue", "Blue", "#0a1a3a"]];
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

	/* ---------- state ---------- */
	function defaultH12() { try { return /^(en-US|en-CA|en-AU|en-IN|en-PH|es-MX|hi|ar|ko)/i.test(navigator.language || "") ? true : new Intl.DateTimeFormat(navigator.language, { hour: "numeric" }).resolvedOptions().hour12 === true; } catch (e) { return false; } }
	var S = { mode: "digital", h12: defaultH12(), sec: true, date: true, extra: false, title: false, theme: "auto", size: 3, tz: "", zones: ["Asia/Tokyo", "Europe/London"] };
	var memOnly = false;
	function load() {
		try {
			var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (!s) return;
			if (/^(digital|analog|both)$/.test(s.mode)) S.mode = s.mode;
			["h12", "sec", "date", "extra", "title"].forEach(function (k) { if (typeof s[k] === "boolean") S[k] = s[k]; });
			if (THEMES.some(function (t) { return t[0] === s.theme; })) S.theme = s.theme;
			if (+s.size >= 1 && +s.size <= 5) S.size = +s.size;
			if (typeof s.tz === "string" && (!s.tz || CK.valid(s.tz))) S.tz = s.tz;
			if (Array.isArray(s.zones)) S.zones = s.zones.filter(function (z) { return typeof z === "string" && CK.valid(z); }).slice(0, 8);
		} catch (e) { memOnly = true; }
	}
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); memOnly = false; } catch (e) { memOnly = true; } }
	function mainTz() { return S.tz || LOCAL; }

	/* ---------- zone list (for the type-ahead) ---------- */
	var ALL = []; try { ALL = Intl.supportedValuesOf ? Intl.supportedValuesOf("timeZone") : []; } catch (e) {}
	if (!ALL.length) ALL = CK.POPULAR.concat(["UTC"]);
	if (ALL.indexOf("UTC") < 0) ALL.push("UTC");
	$("ck-zones").innerHTML = ALL.map(function (z) { return '<option value="' + esc(z) + '" label="' + esc(CK.city(z)) + '">'; }).join("");
	// "tokyo" / "new york" / "Asia/Tokyo" -> a valid zone id
	function resolveZone(text) {
		var t = String(text || "").trim(); if (!t) return "";
		if (CK.valid(t) && t.indexOf("/") > 0 || t.toUpperCase() === "UTC") return t.toUpperCase() === "UTC" ? "UTC" : t;
		var q = t.toLowerCase().replace(/\s+/g, "_"), hit = ALL.filter(function (z) { return CK.city(z).toLowerCase().replace(/\s+/g, "_") === q; })[0] || ALL.filter(function (z) { return z.toLowerCase().indexOf(q) >= 0; })[0];
		return hit || null;
	}

	/* ---------- analog face ---------- */
	function buildAnalog() {
		var s = '<svg viewBox="0 0 200 200" role="img" aria-label="Analog clock"><circle class="ck-face" cx="100" cy="100" r="96"/>';
		for (var i = 0; i < 60; i++) { var a = i * 6 * Math.PI / 180, big = i % 5 === 0, r1 = big ? 84 : 90, r2 = 94; s += '<line class="ck-tick' + (big ? " ck-tick--5" : "") + '" x1="' + (100 + r1 * Math.sin(a)).toFixed(2) + '" y1="' + (100 - r1 * Math.cos(a)).toFixed(2) + '" x2="' + (100 + r2 * Math.sin(a)).toFixed(2) + '" y2="' + (100 - r2 * Math.cos(a)).toFixed(2) + '"/>'; }
		for (var n = 1; n <= 12; n++) { var b = n * 30 * Math.PI / 180; s += '<text class="ck-num" x="' + (100 + 68 * Math.sin(b)).toFixed(2) + '" y="' + (100 - 68 * Math.cos(b)).toFixed(2) + '">' + n + "</text>"; }
		s += '<line class="ck-hand" id="ck-hh" x1="100" y1="108" x2="100" y2="54" stroke-width="5"/><line class="ck-hand" id="ck-mh" x1="100" y1="112" x2="100" y2="30" stroke-width="3.2"/><g id="ck-sh"><line class="ck-hand ck-hand--s" x1="100" y1="118" x2="100" y2="22"/></g><circle class="ck-cap" cx="100" cy="100" r="4.5"/></svg>';
		$("ck-analog").innerHTML = s;
	}
	buildAnalog();
	function rot(id, deg) { var e = $(id); if (e) e.setAttribute("transform", "rotate(" + deg.toFixed(2) + " 100 100)"); }

	/* ---------- the main clock ---------- */
	var cache = {};
	var DATE_FMT = {};
	function dateText(now, tz) {
		var k = tz; if (!DATE_FMT[k]) DATE_FMT[k] = new Intl.DateTimeFormat(navigator.language || "en-US", { timeZone: tz, weekday: "long", year: "numeric", month: "long", day: "numeric" });
		return DATE_FMT[k].format(now);
	}
	function render(force) {
		var now = new Date(), tz = mainTz(), p = CK.partsIn(now, tz), digital = S.mode !== "analog", analog = S.mode !== "digital";
		if (digital) {
			var t = CK.timeText(p, S.h12, S.sec), suffix = "";
			if (S.h12) { var m = /^(.*?)( AM| PM)$/.exec(t); if (m) { t = m[1]; suffix = m[2].trim(); } }
			var html = esc(t) + (suffix ? "<small>" + suffix + "</small>" : "");
			if (force || cache.d !== html) { cache.d = html; $("ck-digital").innerHTML = html; }
		}
		if (analog) { var A = CK.angles(p, S.sec); rot("ck-hh", A.hour); rot("ck-mh", A.min); if (S.sec) rot("ck-sh", A.sec); }
		var dk = p.y + "-" + p.mo + "-" + p.d + "|" + S.date + "|" + S.extra + "|" + tz;
		if (force || cache.date !== dk) {
			cache.date = dk; var parts = [];
			if (S.date) parts.push(dateText(now, tz));
			if (S.extra) parts.push("Week " + CK.isoWeek(p.y, p.mo, p.d) + " · day " + CK.dayOfYear(p.y, p.mo, p.d));
			$("ck-date").innerHTML = parts.map(esc).join("<br>"); $("ck-date").hidden = !parts.length;
		}
		var off = CK.offsetLabel(CK.offsetMin(now, tz)), line = (S.tz ? CK.city(S.tz) : "Your time zone (" + CK.city(LOCAL) + ")") + " · " + off;
		if (force || cache.tzl !== line) { cache.tzl = line; $("ck-tzline").textContent = line; }
		if (S.title) { var tt = CK.timeText(p, S.h12, false) + " | Clock"; if (document.title !== tt) document.title = tt; } else if (document.title !== BASE_TITLE) document.title = BASE_TITLE;
		renderWorld(now, p);
	}
	function renderWorld(now, mainP) {
		var key = Math.floor(now.getTime() / (S.sec ? 1000 : 60000)) + "|" + S.h12 + "|" + S.zones.join(",") + "|" + mainTz();
		if (cache.w === key) return; cache.w = key;
		var mainOff = CK.offsetMin(now, mainTz());
		$("ck-world").innerHTML = S.zones.map(function (z) {
			var p = CK.partsIn(now, z), off = CK.offsetMin(now, z), wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][p.wd], same = p.d === mainP.d && p.mo === mainP.mo;
			return '<div class="ck-w" data-z="' + esc(z) + '"><button type="button" class="ck-x" aria-label="Remove ' + esc(CK.city(z)) + '" title="Remove">✕</button><b>' + (CK.isDay(p) ? "☀️ " : "🌙 ") + esc(CK.city(z)) + '</b><div class="ck-wt">' + esc(CK.timeText(p, S.h12, false)) + '</div><small>' + wd + ", " + p.mo + "/" + p.d + (same ? "" : (p.d > mainP.d || p.mo > mainP.mo ? " (next day)" : " (previous day)")) + " · " + CK.offsetLabel(off) + "<br>" + CK.diffText(off, mainOff) + " " + esc(S.tz ? CK.city(S.tz) : "you") + "</small></div>";
		}).join("");
		$("ck-world-note").textContent = S.zones.length ? "" : "Add a city above to see its time here.";
		$("ck-add-go").disabled = S.zones.length >= 8;
	}

	/* ---------- controls ---------- */
	function applyUi() {
		$("ck-main").setAttribute("data-theme", S.theme); $("ck-stage").setAttribute("data-size", String(S.size));
		$("ck-analog").hidden = S.mode === "digital"; $("ck-digital").hidden = S.mode === "analog";
		[].forEach.call($("ck-mode").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.m === S.mode)); });
		[].forEach.call($("ck-h").children, function (b) { b.setAttribute("aria-pressed", String((b.dataset.h === "12") === S.h12)); });
		[].forEach.call($("ck-themes").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.t === S.theme)); });
		$("ck-sec").checked = S.sec; $("ck-showdate").checked = S.date; $("ck-extra").checked = S.extra; $("ck-title").checked = S.title; $("ck-size").value = S.size;
		$("ck-tz").value = S.tz ? S.tz : ""; $("ck-sh") && ($("ck-sh").style.display = S.sec ? "" : "none");
	}
	$("ck-themes").innerHTML = THEMES.map(function (t) { return '<button type="button" class="tu-chip" data-t="' + t[0] + '" aria-pressed="false"><span class="ck-dot" style="background:' + t[2] + '"></span>' + t[1] + "</button>"; }).join("");
	$("ck-themes").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.theme = b.dataset.t; save(); applyUi(); });
	$("ck-mode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.mode = b.dataset.m; save(); applyUi(); render(true); });
	$("ck-h").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; S.h12 = b.dataset.h === "12"; save(); applyUi(); render(true); cache.w = ""; });
	[["ck-sec", "sec"], ["ck-showdate", "date"], ["ck-extra", "extra"], ["ck-title", "title"]].forEach(function (p) { $(p[0]).onchange = function () { S[p[1]] = this.checked; save(); applyUi(); render(true); cache.w = ""; }; });
	$("ck-size").oninput = function () { S.size = +this.value; save(); applyUi(); };
	$("ck-tz").addEventListener("change", function () {
		var v = this.value.trim(); if (!v || /^(local|auto|my)/i.test(v)) { S.tz = ""; } else { var z = resolveZone(v); if (!z) { toast("Time zone not found: try a city such as Tokyo or New York"); this.value = S.tz; return; } S.tz = z === LOCAL ? "" : z; }
		save(); applyUi(); render(true); cache.w = "";
	});
	function addZone(text) {
		var z = resolveZone(text); if (!z) { toast("Time zone not found: try a city such as Tokyo or New York"); return; }
		if (S.zones.indexOf(z) >= 0) { toast(CK.city(z) + " is already there"); return; }
		if (S.zones.length >= 8) { toast("You can keep up to 8 extra clocks"); return; }
		S.zones.push(z); $("ck-add").value = ""; save(); cache.w = ""; render(true);
	}
	$("ck-add-go").onclick = function () { addZone($("ck-add").value); };
	$("ck-add").addEventListener("keydown", function (e) { if (e.key === "Enter") addZone(this.value); });
	$("ck-add").addEventListener("change", function () { if (this.value && ALL.indexOf(this.value) >= 0) addZone(this.value); });
	$("ck-world").addEventListener("click", function (e) { var x = e.target.closest(".ck-x"); if (!x) return; var z = x.closest(".ck-w").dataset.z; S.zones = S.zones.filter(function (q) { return q !== z; }); save(); cache.w = ""; render(true); });
	$("ck-quick").innerHTML = CK.POPULAR.map(function (z) { return '<button type="button" class="tu-chip" data-z="' + esc(z) + '">' + esc(CK.city(z)) + "</button>"; }).join("");
	$("ck-quick").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) addZone(b.dataset.z); });
	function toast(msg) { var t = $("ck-toast"); if (!t) { t = document.createElement("div"); t.id = "ck-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }

	/* ---------- full screen + wake lock ---------- */
	var lock = null;
	function setFull(on) {
		var el = $("ck-main"); el.classList.toggle("ck-fs", on); $("ck-full").textContent = on ? "✕ Close" : "⤢ Full screen";
		if (on) { try { if (el.requestFullscreen) el.requestFullscreen().catch(function () {}); } catch (e) {} if ("wakeLock" in navigator) navigator.wakeLock.request("screen").then(function (l) { lock = l; }, function () {}); }
		else { if (document.fullscreenElement && document.exitFullscreen) { try { document.exitFullscreen(); } catch (e) {} } if (lock) { lock.release().catch(function () {}); lock = null; } }
	}
	$("ck-full").onclick = function () { setFull(!$("ck-main").classList.contains("ck-fs")); };
	document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && $("ck-main").classList.contains("ck-fs")) setFull(false); });
	document.addEventListener("keydown", function (e) {
		var tag = (e.target.tagName || "").toLowerCase(); if (/^(input|textarea|select)$/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key === "f" || e.key === "F") setFull(!$("ck-main").classList.contains("ck-fs")); else if (e.key === "Escape" && $("ck-main").classList.contains("ck-fs")) setFull(false);
	});
	$("ck-stage").addEventListener("dblclick", function () { setFull(!$("ck-main").classList.contains("ck-fs")); });

	/* ---------- init ---------- */
	load();
	var q = new URLSearchParams(location.search);
	if (q.get("tz")) { var z = resolveZone(q.get("tz")); if (z) S.tz = z === LOCAL ? "" : z; }
	if (/^(digital|analog|both)$/.test(q.get("mode") || "")) S.mode = q.get("mode");
	if (q.get("h") === "12" || q.get("h") === "24") S.h12 = q.get("h") === "12";
	if (THEMES.some(function (t) { return t[0] === q.get("theme"); })) S.theme = q.get("theme");
	if (q.get("sec") === "0" || q.get("sec") === "1") S.sec = q.get("sec") === "1";
	if (q.toString()) history.replaceState(null, "", location.pathname);
	applyUi(); render(true); save();
	// smooth second hand: animation frames when the seconds hand shows, otherwise a light timer
	(function loop() { render(false); if (S.sec && S.mode !== "digital" && !document.hidden) requestAnimationFrame(loop); else setTimeout(loop, S.sec ? 250 : 1000); })();
})();
