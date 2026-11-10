/* MES GTA 6 community map (mes.fm/gta-6-map, #gt[data-page="map"]): an original rough fan sketch of Leonida with pins people add
   (secrets, animals, fishing spots ...) and up / down votes. Data: mes.fm/api/gta-map.js; validation + ordering = MESGTA.MAP (lib.js).
   On 127.0.0.1 / localhost (no /api) or with ?mock=1 an in-browser stand-in (localStorage "mes-gta-map:mock") answers instead.
   State: localStorage "mes-gta-map:v1" = {vid, mine:{id: key}, votes:{id: 1|-1}, sort, ver, cats, grid, labels}. Debug: window.MESGTAMapDebug. */
(function () {
	"use strict";
	var root = document.getElementById("gt");
	if (!root || root.getAttribute("data-page") !== "map" || !window.MESGTA) return;
	var stage = document.getElementById("gm-stage");
	var MAP = window.MESGTA.MAP, KEY = "mes-gta-map:v1", SVGNS = "http://www.w3.org/2000/svg";
	var $ = function (id) { return document.getElementById(id); };
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
	function el(tag, attrs, parent) { var e = document.createElementNS(SVGNS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
	function load() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	var S = load();
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }
	if (!/^[a-f0-9]{32}$/.test(S.vid || "")) { var b = new Uint8Array(16); (window.crypto || {}).getRandomValues ? crypto.getRandomValues(b) : b.forEach(function (_, i) { b[i] = Math.random() * 256; }); S.vid = Array.prototype.map.call(b, function (x) { return (x < 16 ? "0" : "") + x.toString(16); }).join(""); save(); }
	S.mine = S.mine || {}; S.votes = S.votes || {}; S.cats = S.cats || [];
	var T0 = Date.now();
	function toast(m) { var t = $("gj-toast"); if (!t) return; t.textContent = m; t.classList.add("is-on"); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.remove("is-on"); }, 3600); }
	var ICON = { secret: "🤫", animal: "🦌", fishing: "🎣", gem: "💎", egg: "🥚", collect: "⭐", activity: "🎯", vehicle: "🚗", stunt: "🏁", other: "📍" };
	function catColor(id) { for (var i = 0; i < MAP.PIN_CATS.length; i++) if (MAP.PIN_CATS[i][0] === id) return MAP.PIN_CATS[i][2]; return "#6d4c41"; }

	/* ======================= the base map (original sketch; 0..1000) ======================= */
	var LAND = "M70,130 C150,95 260,110 330,128 C420,150 470,118 560,110 C660,100 760,120 870,108 L905,120 C900,190 860,240 850,300 " +
		"C845,380 870,440 880,520 C890,600 900,660 870,740 C850,800 800,840 745,860 C705,872 668,850 650,812 C630,770 600,735 575,690 " +
		"C548,640 530,590 520,530 C512,480 498,420 470,380 C440,335 405,300 360,285 C300,265 245,282 190,268 C140,255 95,232 70,205 Z";
	var LAKE = "M600,430 C640,410 690,420 700,455 C708,490 670,515 630,505 C595,497 580,455 600,430 Z";
	var KEYS = [[700, 885, 22, 9], [660, 905, 18, 7], [618, 920, 20, 7], [574, 932, 17, 6], [532, 942, 19, 7], [490, 950, 15, 6], [450, 957, 18, 6], [410, 962, 14, 5]];
	var ISLES = [[905, 640, 26, 60], [255, 330, 30, 14]];
	var REG = [  /* name, label x, y, shaded area path (rough) */
		["Port Gellhorn", 210, 190, "M90,150 C170,120 300,130 360,150 L380,270 C300,262 230,280 170,262 C120,250 90,220 90,150 Z", "#9fb8a6"],
		["Mount Kalaga", 500, 165, "M400,140 C470,120 560,118 640,120 L660,240 C580,250 500,250 430,235 Z", "#b9a98e"],
		["Ambrosia", 700, 300, "M640,180 C720,150 820,150 860,170 L850,330 C860,390 870,420 860,430 C790,430 700,400 640,390 C560,380 520,330 560,260 Z", "#c9c08f"],
		["Grassrivers", 640, 640, "M540,520 C600,540 700,560 760,580 C770,650 760,720 730,780 C690,790 650,770 620,730 C580,680 548,610 540,520 Z", "#8fb38a"],
		["Vice City", 830, 700, "M790,560 C830,560 870,570 885,610 C892,680 880,740 850,790 C820,800 780,790 770,750 C770,690 775,620 790,560 Z", "#c7a0b3"],
		["Leonida Keys", 540, 900, null, null]];
	var ROADS = ["M150,210 C300,205 450,190 600,180 C700,175 800,190 870,200", "M760,180 C780,300 820,420 840,560 C850,640 845,720 830,780",
		"M600,180 C590,280 600,380 620,470 C640,560 700,640 780,700", "M745,860 C700,890 620,920 520,945 C470,955 430,960 400,962"];
	function drawBase() {
		var g = $("gm-base"); g.innerHTML = "";
		el("path", { d: LAND, "class": "gm-land" }, g);
		ISLES.forEach(function (i) { el("ellipse", { cx: i[0], cy: i[1], rx: i[2], ry: i[3], "class": "gm-land" }, g); });
		KEYS.forEach(function (k) { el("ellipse", { cx: k[0], cy: k[1], rx: k[2], ry: k[3], "class": "gm-land" }, g); });
		REG.forEach(function (r) { if (r[3]) el("path", { d: r[3], "class": "gm-reg", fill: r[4] }, g); });
		el("path", { d: LAKE, "class": "gm-water" }, g);
		el("path", { d: "M520,560 C560,600 600,640 620,700 M560,540 C610,590 660,600 700,640", "class": "gm-river" }, g);
		for (var i = 0; i < 5; i++) el("path", { d: "M" + (450 + i * 38) + ",200 l14,-26 l14,26", "class": "gm-mtn" }, g);
		ROADS.forEach(function (d) { el("path", { d: d, "class": "gm-road" }, g); });
		/* city blocks for Vice City */
		for (var r = 0; r < 4; r++) for (var c = 0; c < 3; c++) el("rect", { x: 805 + c * 16, y: 650 + r * 18, width: 11, height: 13, rx: 1.5, "class": "gm-block" }, g);
		el("path", { d: LAND, "class": "gm-coast" }, g);
		var n = $("gm-names"); n.innerHTML = "";
		REG.forEach(function (r) { var t = el("text", { x: r[1], y: r[2], "class": "gm-name", "text-anchor": "middle" }, n); t.textContent = r[0]; });
		var gg = $("gm-gridg"); gg.innerHTML = "";
		for (var j = 0; j <= 10; j++) {
			el("line", { x1: j * 100, y1: 0, x2: j * 100, y2: 1000, "class": "gm-gl" }, gg);
			el("line", { x1: 0, y1: j * 100, x2: 1000, y2: j * 100, "class": "gm-gl" }, gg);
			if (j < 10) {
				var a = el("text", { x: j * 100 + 50, y: 16, "class": "gm-gt", "text-anchor": "middle" }, gg); a.textContent = "ABCDEFGHIJ"[j];
				var d = el("text", { x: 8, y: j * 100 + 56, "class": "gm-gt" }, gg); d.textContent = String(j + 1);
			}
		}
	}
	function gridRef(x, y) { return "ABCDEFGHIJ"[Math.min(9, Math.floor(x / 100))] + (Math.min(9, Math.floor(y / 100)) + 1); }
	function nearRegion(x, y) {
		/* inside a shaded area first, else the nearest label */
		var svg = $("gm-svg"), best = "", bd = 1e9;
		for (var i = 0; i < REG.length; i++) {
			var r = REG[i];
			if (r[3] && svg.createSVGPoint) { var p = $("gm-base").querySelectorAll(".gm-reg")[i]; if (p && p.isPointInFill) { var pt = svg.createSVGPoint(); pt.x = x; pt.y = y; try { if (p.isPointInFill(pt)) return r[0]; } catch (e) { /* old browser */ } } }
			var dd = (r[1] - x) * (r[1] - x) + (r[2] - y) * (r[2] - y); if (dd < bd) { bd = dd; best = r[0]; }
		}
		return bd < 240 * 240 ? best : "Somewhere else";
	}

	/* ======================= view: pan and zoom ======================= */
	var V = { z: 1, tx: 0, ty: 0 }, ZMIN = 1, ZMAX = 8;
	function applyView() {
		V.z = Math.max(ZMIN, Math.min(ZMAX, V.z));
		var lim = 1000 * (V.z - 1); V.tx = Math.min(80, Math.max(-lim - 80, V.tx)); V.ty = Math.min(80, Math.max(-lim - 80, V.ty));
		$("gm-vp").setAttribute("transform", "translate(" + V.tx.toFixed(2) + "," + V.ty.toFixed(2) + ") scale(" + V.z.toFixed(4) + ")");
		var u = 1000 / Math.max(160, Math.min(stage.clientWidth || 600, stage.clientHeight || 600)), k = (0.95 * u / V.z).toFixed(4);   /* u = map units per screen px: pins keep their size on screen */
		Array.prototype.forEach.call(document.querySelectorAll("#gm-pins > g, #gm-draft > g"), function (p) { p.setAttribute("transform", "translate(" + p.getAttribute("data-x") + "," + p.getAttribute("data-y") + ") scale(" + k + ")"); });
		$("gm-names").setAttribute("font-size", (14 * u / V.z).toFixed(2));
		$("gm-gridg").setAttribute("font-size", (11 * u / V.z).toFixed(2));
		placePop();
	}
	function svgPt(cx, cy) { var svg = $("gm-svg"), pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy; var m = svg.getScreenCTM(); return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
	function mapPt(cx, cy) { var p = svgPt(cx, cy); return { x: (p.x - V.tx) / V.z, y: (p.y - V.ty) / V.z }; }
	function zoomAt(f, cx, cy) {
		var p = cx == null ? { x: 500, y: 500 } : svgPt(cx, cy), nz = Math.max(ZMIN, Math.min(ZMAX, V.z * f));
		V.tx = p.x - (p.x - V.tx) * nz / V.z; V.ty = p.y - (p.y - V.ty) * nz / V.z; V.z = nz; applyView();
	}
	function fit() { V.z = 1; V.tx = 0; V.ty = 0; applyView(); }
	function centreOn(x, y, z) { V.z = Math.max(V.z, z || 2.5); V.tx = 500 - x * V.z; V.ty = 500 - y * V.z; applyView(); }

	var ptrs = {}, drag = null;
	stage.addEventListener("pointerdown", function (e) {
		if (e.target.closest(".gm-pop, .gm-ask")) return;
		ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
		var ids = Object.keys(ptrs);
		if (ids.length === 1) drag = { x: e.clientX, y: e.clientY, tx: V.tx, ty: V.ty, moved: false, pin: e.target.closest("[data-pin]") };
		else if (ids.length === 2) { var a = ptrs[ids[0]], b2 = ptrs[ids[1]]; drag = { pinch: Math.hypot(a.x - b2.x, a.y - b2.y), z: V.z, moved: true }; }
		try { stage.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
	});
	stage.addEventListener("pointermove", function (e) {
		if (!ptrs[e.pointerId] || !drag) return;
		ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
		var ids = Object.keys(ptrs);
		if (drag.pinch && ids.length === 2) {
			var a = ptrs[ids[0]], b2 = ptrs[ids[1]], d = Math.hypot(a.x - b2.x, a.y - b2.y);
			zoomAt(drag.z * d / drag.pinch / V.z, (a.x + b2.x) / 2, (a.y + b2.y) / 2); return;
		}
		if (drag.pinch) return;
		var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
		if (!drag.moved && Math.hypot(dx, dy) < 6) return;
		drag.moved = true; stage.classList.add("is-drag");
		var s = 1000 / Math.max(1, Math.min(stage.clientWidth, stage.clientHeight));   /* screen px -> svg units (meet) */
		V.tx = drag.tx + dx * s; V.ty = drag.ty + dy * s; applyView();
	});
	function up(e) {
		if (!ptrs[e.pointerId]) return;
		delete ptrs[e.pointerId];
		var d = drag; if (Object.keys(ptrs).length) return;
		drag = null; stage.classList.remove("is-drag");
		if (!d || d.moved || d.pinch) return;
		if (d.pin) { openPin(d.pin.getAttribute("data-pin")); return; }
		var p = mapPt(e.clientX, e.clientY);
		if (p.x < 0 || p.y < 0 || p.x > 1000 || p.y > 1000) return;
		if (mode === "add") setDraft(p.x, p.y);
		else { closePop(); askAt(p.x, p.y); }
	}
	stage.addEventListener("pointerup", up);
	stage.addEventListener("pointercancel", function (e) { delete ptrs[e.pointerId]; drag = null; stage.classList.remove("is-drag"); });
	stage.addEventListener("wheel", function (e) {
		var full = $("gm-view").classList.contains("mes-pfill");
		if (!full && !e.ctrlKey && !e.metaKey) { hint("Hold Ctrl and scroll to zoom (or use + and −)"); return; }
		e.preventDefault(); zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0018)), e.clientX, e.clientY);
	}, { passive: false });
	function hint(m) { var h = $("gm-status"); h.textContent = m; h.classList.add("is-on"); clearTimeout(hint.t); hint.t = setTimeout(function () { h.classList.remove("is-on"); }, 1800); }
	$("gm-zin").onclick = function () { zoomAt(1.5); };
	$("gm-zout").onclick = function () { zoomAt(1 / 1.5); };
	$("gm-fit").onclick = fit;
	stage.tabIndex = 0;
	stage.addEventListener("keydown", function (e) {
		var k = e.key, step = 60;
		if (k === "+" || k === "=") zoomAt(1.4); else if (k === "-" || k === "_") zoomAt(1 / 1.4); else if (k === "0") fit();
		else if (k === "ArrowLeft") { V.tx += step; applyView(); } else if (k === "ArrowRight") { V.tx -= step; applyView(); }
		else if (k === "ArrowUp") { V.ty += step; applyView(); } else if (k === "ArrowDown") { V.ty -= step; applyView(); }
		else if (k === "Escape") { closePop(); $("gm-ask").hidden = true; } else return;
		e.preventDefault();
	});
	function opt(id, key, cls) {
		var c = $(id); c.checked = S[key] !== false;
		var f = function () { $("gm-svg").classList.toggle(cls, !c.checked); S[key] = c.checked; save(); };
		c.addEventListener("change", f); f();
	}
	opt("gm-grid", "grid", "no-grid"); opt("gm-labels", "labels", "no-names");

	/* ======================= data (API or the local stand-in) ======================= */
	var MOCK = /^(127\.0\.0\.1|localhost)$/.test(location.hostname) || /[?&]mock=1\b/.test(location.search), API = "/api/gta-map";
	var mock = {
		get: function () { try { return JSON.parse(localStorage.getItem("mes-gta-map:mock") || "null"); } catch (e) { return null; } },
		put: function (d) { try { localStorage.setItem("mes-gta-map:mock", JSON.stringify(d)); } catch (e) { /* fine */ } },
		db: function () {
			var d = mock.get();
			if (!d) {
				var t = Date.now(); d = { p: {}, v: {} };
				[["mk00001a", 812, 745, "secret", "Rooftop with a view", "Climb the fire escape behind the pink hotel at night.", "Vice City", 9, 1],
					["mk00002b", 650, 690, "animal", "White alligator", "Sometimes at dawn near the airboat dock. Sample data on this test copy.", "Grassrivers", 3, 4],
					["mk00003c", 560, 925, "fishing", "Tarpon spot", "Off the end of the old bridge.", "Leonida Keys", 1, 0]].forEach(function (r, i) {
					d.p[r[0]] = { x: r[1], y: r[2], cat: r[3], title: r[4], desc: r[5], region: r[6], clip: "", m: 1, c: t - (i + 1) * 3600e3, up: r[7], dn: r[8] };
				});
				mock.put(d);
			}
			return d;
		},
		call: function (body) {
			var d = mock.db();
			return new Promise(function (res) { setTimeout(function () { res(mock.answer(d, body)); }, 120); });
		},
		answer: function (d, b) {
			if (!b) { return { pins: Object.keys(d.p).map(function (id) { var p = d.p[id]; return Object.assign({ id: id }, p); }).filter(function (p) { return p.up - p.dn > -5; }), now: Date.now() }; }
			if (b.act === "new") { var c = MAP.cleanPin(b); if (c.error) return { error: c.error }; var id = "mk" + Math.random().toString(36).slice(2, 8); var key = S.vid.split("").reverse().join(""); d.p[id] = Object.assign(c.pin, { c: Date.now(), up: 0, dn: 0, own: 1 }); mock.put(d); return { id: id, key: key, pin: Object.assign({ id: id }, d.p[id]) }; }
			var p = d.p[b.id]; if (!p) return { error: "pin not found" };
			if (b.act === "vote") { if (p.own) return { error: "you can’t vote on your own pin" }; var prev = d.v[b.id] || 0; if (prev === 1) p.up--; if (prev === -1) p.dn--; if (b.v === 1) p.up++; if (b.v === -1) p.dn++; d.v[b.id] = b.v; mock.put(d); return { up: p.up, dn: p.dn, mine: b.v }; }
			if (b.act === "report") return { ok: true };
			if (b.act === "del") { delete d.p[b.id]; mock.put(d); return { ok: true }; }
			return { error: "unknown action" };
		}
	};
	function call(body) {
		if (MOCK) return mock.call(body);
		var o = body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" };
		return fetch(API, o).then(function (r) { return r.json().catch(function () { return { error: "the server did not answer (" + r.status + ")" }; }); }, function () { return { error: "no connection, try again" }; });
	}
	var PINS = [], byId = {};
	function refresh(quiet) {
		return call(null).then(function (d) {
			if (d.error) { if (!quiet) $("gm-count").textContent = d.error === "not set up" ? "The pin store isn’t switched on yet." : "Could not load the pins: " + d.error; return; }
			PINS = d.pins || []; byId = {}; PINS.forEach(function (p) { byId[p.id] = p; });
			Object.keys(S.mine).forEach(function (id) { if (!byId[id] && !quiet) { /* deleted or hidden: keep the key a while */ } });
			drawPins(); renderList(); if (openId && byId[openId]) openPin(openId, true);
		});
	}

	/* ======================= pins on the map ======================= */
	function pinG(p, parent, cls) {
		var g = el("g", { "class": "gm-pin " + (cls || ""), "data-x": p.x, "data-y": p.y }, parent);
		var st = MAP.pinStatus(p.up, p.dn);
		el("path", { d: "M0,0 C-4,-9 -15,-14 -15,-26 A15,15 0 1 1 15,-26 C15,-14 4,-9 0,0 Z", "class": "gm-pinb", fill: catColor(p.cat) }, g);
		if (st === "verified") el("circle", { cx: 11, cy: -37, r: 6.5, "class": "gm-pinv" }, g);
		if (st === "disputed") el("circle", { cx: 11, cy: -37, r: 6.5, "class": "gm-pind" }, g);
		var t = el("text", { x: 0, y: -21, "text-anchor": "middle", "class": "gm-pini" }, g); t.textContent = ICON[p.cat] || "📍";
		return g;
	}
	function shown() {
		var list = MAP.filterPins(PINS, { q: $("gm-q").value, cats: S.cats, verified: S.ver });
		if (S.mineOnly) list = list.filter(function (p) { return S.mine[p.id]; });
		return MAP.sortPins(list, S.sort || "top");
	}
	function drawPins() {
		var g = $("gm-pins"); g.innerHTML = "";
		var list = shown().slice().sort(function (a, b) { return a.y - b.y; });   /* lower pins drawn on top */
		list.forEach(function (p) { var e = pinG(p, g); e.setAttribute("data-pin", p.id); e.setAttribute("tabindex", "0"); e.setAttribute("role", "button"); e.setAttribute("aria-label", p.title); if (p.id === openId) e.classList.add("is-open"); });
		applyView();
	}
	$("gm-pins").addEventListener("keydown", function (e) { var p = e.target.closest("[data-pin]"); if (p && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openPin(p.getAttribute("data-pin")); } });

	/* ======================= pin card ======================= */
	var openId = null;
	function statusText(st) { return { verified: '<span class="gm-st gm-st--v">✓ Verified</span>', disputed: '<span class="gm-st gm-st--d">Disputed</span>', "new": '<span class="gm-st gm-st--n">New</span>' }[st] || ""; }
	function ago(ms) { var s = (Date.now() - ms) / 1000; if (s < 90) return "just now"; if (s < 5400) return Math.round(s / 60) + " min ago"; if (s < 129600) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " days ago"; }
	function openPin(id, keep) {
		var p = byId[id]; if (!p) return;
		openId = id; $("gm-ask").hidden = true;
		var mine = S.mine[id], v = S.votes[id] || 0, st = MAP.pinStatus(p.up, p.dn), pop = $("gm-pop");
		pop.innerHTML = '<button type="button" class="gm-x" data-a="close" aria-label="Close">×</button>' +
			'<p class="gm-pk"><span class="gm-dot" style="background:' + catColor(p.cat) + '"></span>' + esc(MAP.catName(p.cat)) + (p.region ? " · " + esc(p.region) : "") + " · " + gridRef(p.x, p.y) + " " + statusText(st) + "</p>" +
			"<h3>" + esc(p.title) + "</h3>" + (p.desc ? '<p class="gm-pd">' + esc(p.desc).replace(/\n/g, "<br>") + "</p>" : "") +
			(p.clip ? '<a class="gm-clip" href="https://www.youtube.com/watch?v=' + esc(p.clip) + '" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/' + esc(p.clip) + '/mqdefault.jpg" alt="" loading="lazy" width="160" height="90"><span>▶ Watch the clip</span></a>' : "") +
			'<div class="gm-votes">' + (mine ? '<span class="gm-own">Your pin · ' + (p.up - p.dn >= 0 ? "+" : "") + (p.up - p.dn) + " (" + p.up + " up, " + p.dn + " down)</span>" :
				'<button type="button" class="gm-vb gm-vb--up' + (v === 1 ? " is-on" : "") + '" data-a="up" aria-pressed="' + (v === 1) + '" title="It\'s real">▲ <b>' + p.up + "</b></button>" +
				'<button type="button" class="gm-vb gm-vb--dn' + (v === -1 ? " is-on" : "") + '" data-a="dn" aria-pressed="' + (v === -1) + '" title="Fake / not there">▼ <b>' + p.dn + "</b></button>" +
				'<span class="gm-vh">' + (v ? "Click again to take your vote back" : "Is it real?") + "</span>") + "</div>" +
			'<p class="gm-pf">Added ' + ago(p.c) + ' · <button type="button" class="gm-lnk" data-a="share">Copy link</button>' +
			(mine ? ' · <button type="button" class="gm-lnk" data-a="del">Delete my pin</button>' : ' · <button type="button" class="gm-lnk" data-a="report">Report</button>') + "</p>";
		pop.hidden = false; placePop();
		Array.prototype.forEach.call(document.querySelectorAll("#gm-pins > g"), function (g) { g.classList.toggle("is-open", g.getAttribute("data-pin") === id); });
		Array.prototype.forEach.call(document.querySelectorAll("#gm-list li"), function (li) { li.classList.toggle("is-open", li.getAttribute("data-id") === id); });
		if (!keep) { var u = new URL(location.href); u.searchParams.set("pin", id); history.replaceState(null, "", u); }
	}
	function closePop() {
		openId = null; $("gm-pop").hidden = true;
		Array.prototype.forEach.call(document.querySelectorAll(".is-open"), function (e) { if (e.closest("#gm-pins, #gm-list")) e.classList.remove("is-open"); });
		var u = new URL(location.href); if (u.searchParams.has("pin")) { u.searchParams.delete("pin"); history.replaceState(null, "", u); }
	}
	function screenOf(x, y) {   /* map coords -> px inside the stage */
		var svg = $("gm-svg"), m = svg.getScreenCTM(), r = stage.getBoundingClientRect(); if (!m) return null;
		var sx = V.tx + x * V.z, sy = V.ty + y * V.z;
		return { x: m.a * sx + m.e - r.left, y: m.d * sy + m.f - r.top };
	}
	function placePop() {
		var pop = $("gm-pop"), p = openId && byId[openId];
		[[pop, p], [$("gm-ask"), askPt]].forEach(function (pair) {
			var box = pair[0], at = pair[1]; if (box.hidden || !at) return;
			var s = screenOf(at.x, at.y); if (!s) return;
			var w = box.offsetWidth, h = box.offsetHeight, W = stage.clientWidth, H = stage.clientHeight;
			var left = Math.max(6, Math.min(W - w - 6, s.x - w / 2)), top = s.y - h - 48;
			if (top < 6) top = Math.min(H - h - 6, s.y + 14);
			box.style.left = left + "px"; box.style.top = Math.max(6, top) + "px";
		});
	}
	$("gm-pop").addEventListener("click", function (e) {
		var b = e.target.closest("[data-a]"); if (!b) return;
		var a = b.getAttribute("data-a"), id = openId, p = byId[id];
		if (a === "close") return closePop();
		if (!p) return;
		if (a === "up" || a === "dn") {
			var want = a === "up" ? 1 : -1, cur = S.votes[id] || 0, v = cur === want ? 0 : want;
			if (Date.now() - T0 < 900) return;
			call({ act: "vote", id: id, vid: S.vid, v: v, t: Date.now() - T0 }).then(function (d) {
				if (d.error) { toast(d.error); return; }
				p.up = d.up; p.dn = d.dn; if (d.mine) S.votes[id] = d.mine; else delete S.votes[id]; save();
				drawPins(); renderList(); openPin(id, true);
				if (v) toast(v === 1 ? "Thanks: marked real" : "Thanks: marked fake");
			});
		} else if (a === "share") {
			var url = location.origin + location.pathname + "?pin=" + id;
			(navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast("Link copied"); }, function () { prompt("Copy this link:", url); });
		} else if (a === "report") {
			if (!confirm("Report this pin as spam, rude or nonsense? Pins reported by several people are hidden.")) return;
			call({ act: "report", id: id, vid: S.vid }).then(function (d) { toast(d.error || "Reported. Thank you."); });
		} else if (a === "del") {
			if (!confirm("Delete your pin “" + p.title + "”? This can’t be undone.")) return;
			call({ act: "del", id: id, key: S.mine[id] }).then(function (d) {
				if (d.error) { toast(d.error); return; }
				delete S.mine[id]; save(); closePop(); PINS = PINS.filter(function (x) { return x.id !== id; }); delete byId[id]; drawPins(); renderList(); toast("Pin deleted");
			});
		}
	});

	/* "add a pin here?" bubble (explore mode) */
	var askPt = null;
	function askAt(x, y) { askPt = { x: x, y: y }; $("gm-ask").hidden = false; placePop(); }
	$("gm-askno").onclick = function () { $("gm-ask").hidden = true; askPt = null; };
	$("gm-askyes").onclick = function () { var p = askPt; $("gm-ask").hidden = true; setMode("add"); if (p) setDraft(p.x, p.y); };

	/* ======================= list ======================= */
	function chips() {
		var counts = {}; PINS.forEach(function (p) { counts[p.cat] = (counts[p.cat] || 0) + 1; });
		$("gm-cats").innerHTML = '<button type="button" class="gm-chip' + (!S.cats.length ? " is-on" : "") + '" data-c="">All <small>' + PINS.length + "</small></button>" +
			MAP.PIN_CATS.map(function (c) { return '<button type="button" class="gm-chip' + (S.cats.indexOf(c[0]) >= 0 ? " is-on" : "") + (counts[c[0]] ? "" : " is-empty") + '" data-c="' + c[0] + '" aria-pressed="' + (S.cats.indexOf(c[0]) >= 0) + '"><span class="gm-dot" style="background:' + c[2] + '"></span>' + esc(c[1]) + " <small>" + (counts[c[0]] || 0) + "</small></button>"; }).join("");
	}
	$("gm-cats").addEventListener("click", function (e) {
		var b = e.target.closest("[data-c]"); if (!b) return;
		var c = b.getAttribute("data-c");
		if (!c) S.cats = []; else { var i = S.cats.indexOf(c); if (i >= 0) S.cats.splice(i, 1); else S.cats.push(c); }
		save(); drawPins(); renderList();
	});
	function renderList() {
		chips();
		var list = shown(), ol = $("gm-list");
		$("gm-count").textContent = PINS.length ? list.length + (list.length === 1 ? " pin" : " pins") + (list.length < PINS.length ? " of " + PINS.length : "") : "No pins yet: be the first! Click the map to add one.";
		ol.innerHTML = list.slice(0, 300).map(function (p) {
			var st = MAP.pinStatus(p.up, p.dn), sc = p.up - p.dn;
			return '<li data-id="' + p.id + '"' + (p.id === openId ? ' class="is-open"' : "") + '><button type="button"><span class="gm-li-i" style="background:' + catColor(p.cat) + '">' + (ICON[p.cat] || "📍") + "</span>" +
				'<span class="gm-li-t"><b>' + esc(p.title) + "</b><small>" + esc(MAP.catName(p.cat)) + (p.region ? " · " + esc(p.region) : "") + (S.mine[p.id] ? " · yours" : "") + " " + statusText(st) + "</small></span>" +
				'<span class="gm-li-s' + (sc > 0 ? " is-pos" : sc < 0 ? " is-neg" : "") + '">' + (sc > 0 ? "+" : "") + sc + "</span></button></li>";
		}).join("");
	}
	$("gm-list").addEventListener("click", function (e) { var li = e.target.closest("li[data-id]"); if (!li) return; var p = byId[li.getAttribute("data-id")]; if (!p) return; centreOn(p.x, p.y); openPin(p.id); if (window.innerWidth < 900) stage.scrollIntoView({ behavior: "smooth", block: "center" }); });
	var qT; $("gm-q").addEventListener("input", function () { clearTimeout(qT); qT = setTimeout(function () { drawPins(); renderList(); }, 120); });
	$("gm-sort").value = S.sort || "top"; $("gm-sort").addEventListener("change", function () { S.sort = this.value; save(); renderList(); });
	$("gm-ver").checked = !!S.ver; $("gm-ver").addEventListener("change", function () { S.ver = this.checked; save(); drawPins(); renderList(); });
	$("gm-mineonly").checked = !!S.mineOnly; $("gm-mineonly").addEventListener("change", function () { S.mineOnly = this.checked; save(); drawPins(); renderList(); });

	/* ======================= add mode ======================= */
	var mode = "explore", draft = null, fcat = "";
	function setMode(m) {
		mode = m;
		Array.prototype.forEach.call(document.querySelectorAll(".gm-modebtn"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-mode") === m ? "true" : "false"); });
		Array.prototype.forEach.call(document.querySelectorAll(".gm-panel"), function (p) { p.hidden = p.getAttribute("data-panel") !== m; });
		root.classList.toggle("gm-adding", m === "add");
		$("gm-hint").textContent = m === "add" ? "Click the map where it is · drag to move · Ctrl + scroll or pinch to zoom" : "Drag to move · Ctrl + scroll or pinch to zoom · click a pin to open it";
		if (m === "add") { closePop(); $("gm-ask").hidden = true; } else { draft = null; $("gm-draft").innerHTML = ""; }
		updWhere();
	}
	root.querySelector(".gm-mode").addEventListener("click", function (e) { var b = e.target.closest("[data-mode]"); if (b) setMode(b.getAttribute("data-mode")); });
	function setDraft(x, y) {
		draft = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
		var g = $("gm-draft"); g.innerHTML = ""; pinG({ x: draft.x, y: draft.y, cat: fcat || "other", up: 0, dn: 0 }, g, "gm-pin--draft");
		var r = nearRegion(draft.x, draft.y); if (!$("gm-freg").dataset.touched) $("gm-freg").value = r;
		applyView(); updWhere();
		if (window.innerWidth < 900 && !$("gm-ftitle").value) setTimeout(function () { $("gm-form").scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 60);
	}
	function updWhere() { $("gm-where").innerHTML = draft ? "<b>1.</b> Spot picked: " + gridRef(draft.x, draft.y) + " (" + esc($("gm-freg").value) + "). Click again to move it." : "<b>1.</b> Click the map where it is."; $("gm-where").classList.toggle("is-done", !!draft); }
	$("gm-fcat").innerHTML = MAP.PIN_CATS.map(function (c) { return '<button type="button" class="gm-chip" role="radio" aria-checked="false" data-c="' + c[0] + '"><span>' + ICON[c[0]] + "</span> " + esc(c[1]) + "</button>"; }).join("");
	$("gm-fcat").addEventListener("click", function (e) {
		var b = e.target.closest("[data-c]"); if (!b) return; fcat = b.getAttribute("data-c");
		Array.prototype.forEach.call(this.querySelectorAll("[data-c]"), function (x) { var on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-checked", on); });
		if (draft) setDraft(draft.x, draft.y);
	});
	$("gm-freg").innerHTML = MAP.REGIONS.map(function (r) { return "<option>" + esc(r) + "</option>"; }).join("");
	$("gm-freg").addEventListener("change", function () { this.dataset.touched = "1"; updWhere(); });
	$("gm-fcancel").onclick = function () { $("gm-form").reset(); fcat = ""; delete $("gm-freg").dataset.touched; Array.prototype.forEach.call($("gm-fcat").querySelectorAll(".is-on"), function (x) { x.classList.remove("is-on"); }); $("gm-ferr").textContent = ""; setMode("explore"); };
	$("gm-form").addEventListener("submit", function (e) {
		e.preventDefault();
		var err = $("gm-ferr"); err.textContent = "";
		if (!draft) { err.textContent = "Click the map first to put the pin where it is."; return; }
		if (!fcat) { err.textContent = "Pick what kind of thing it is."; return; }
		var body = { act: "new", x: draft.x, y: draft.y, cat: fcat, title: $("gm-ftitle").value, desc: $("gm-fdesc").value, region: $("gm-freg").value, clip: $("gm-fclip").value.trim(), vid: S.vid, t: Date.now() - T0 };
		if ($("gm-fhp").value) body.hp = $("gm-fhp").value;
		var chk = MAP.cleanPin({ x: body.x, y: body.y, cat: body.cat, title: body.title, desc: body.desc, region: body.region, clip: body.clip });
		if (chk.error) { err.textContent = chk.error.charAt(0).toUpperCase() + chk.error.slice(1) + "."; return; }
		$("gm-fsave").disabled = true;
		call(body).then(function (d) {
			$("gm-fsave").disabled = false;
			if (d.error) { err.textContent = d.error.charAt(0).toUpperCase() + d.error.slice(1) + "."; return; }
			S.mine[d.id] = d.key; save();
			if (d.pin) { PINS.push(d.pin); byId[d.id] = d.pin; }
			$("gm-fcancel").onclick(); drawPins(); renderList(); openPin(d.id); toast("Pinned! Others can now vote on it.");
		});
	});

	/* ======================= fill window, start ======================= */
	function boot() {
		if (window.MESPanel) window.MESPanel.add($("gm-view"), { bar: $("gm-bar").querySelector(".gm-tools"), stage: stage, onChange: function () { setTimeout(applyView, 30); } });
		else setTimeout(boot, 150);
	}
	drawBase(); fit(); setMode("explore"); renderList(); boot();
	window.addEventListener("resize", function () { applyView(); });
	var want = new URLSearchParams(location.search).get("pin");
	refresh().then(function () { if (want && byId[want]) { centreOn(byId[want].x, byId[want].y, 3); openPin(want, true); } });
	setInterval(function () { if (!document.hidden && mode === "explore" && !drag) refresh(true); }, 60000);
	window.MESGTAMapDebug = { V: V, S: S, pins: function () { return PINS; }, refresh: refresh, setDraft: setDraft, setMode: setMode, openPin: openPin, mapPt: mapPt, mock: mock };
})();
