/* MES GTA 6 community map (mes.fm/gta-6-map, #gt[data-page="map"]): an original rough fan sketch of Leonida with pins people add
   (secrets, animals, fishing spots ...) and up / down votes. Data: mes.fm/api/gta-map.js; validation + ordering = MESGTA.MAP (lib.js).
   On 127.0.0.1 / localhost (no /api) or with ?mock=1 an in-browser stand-in (localStorage "mes-gta-map:mock") answers instead.
   State: localStorage "mes-gta-map:v1" = {vid, mine:{id: key}, votes:{id: 1|-1}, hvotes:{"acct|id": 1|-1}, hsign, sort, ver, cats, grid, labels,
   found:{id: ms} (pins ticked "Found it"), notes:{id: text} (private notes), my:[private markers, kind "m"], places (show MES known places), hideFound}.
   Three kinds of pins share one list: community pins (from the API), known places (MAP.PLACES, kind "k", read-only) and private markers (kind "m",
   only in this browser). Pins closer than ~36 screen px are drawn as one numbered bubble (MAP.clusterPins); click it to zoom in.
   Hive (optional): sign in through main_js/hive.js (MESHive: Keychain extension 4.x, or the Keychain phone app through HiveAuth);
   then a pin or a vote is signed as one custom_json (MESGTA.MAP.HIVE_ID) and only the account + transaction id go to the API,
   which checks the operation on the chain. Debug: window.MESGTAMapDebug. */
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
	S.mine = S.mine || {}; S.votes = S.votes || {}; S.hvotes = S.hvotes || {}; S.cats = S.cats || []; if (S.hsign == null) S.hsign = true;
	S.found = S.found || {}; S.notes = S.notes || {}; S.my = Array.isArray(S.my) ? S.my : []; if (S.places == null) S.places = true;
	(function () { var ch = false; S.my.forEach(function (m) { if (!(m.m >= 2)) { var u = MAP.upgradeXY(m.x, m.y, m.m || 1); m.x = u.x; m.y = u.y; m.m = MAP.MAP_V; ch = true; } }); if (ch) save(); })();
	function upPins(list) { (list || []).forEach(function (p) { if (!(p.m >= 2)) { var u = MAP.upgradeXY(p.x, p.y, p.m || 1); p.x = u.x; p.y = u.y; } }); return list || []; }
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
	/* the v1 shapes above are moved onto the painted v2 picture (affine), so region hit tests and names line up */
	function upPath(d) { var a = MAP.V1TO2, i = 0, prev = 0; return d.replace(/-?\d+(\.\d+)?/g, function (n) { var v = +n; if (i++ % 2 === 0) { prev = v; return "\u0000" + n; } var x = prev, y = v; return (Math.round((a[0] * x + a[1] * y + a[2]) * 10) / 10) + "," + (Math.round((a[3] * x + a[4] * y + a[5]) * 10) / 10); }).replace(/\u0000-?\d+(\.\d+)?,/g, ""); }
	LAND = upPath(LAND); LAKE = upPath(LAKE);
	REG.forEach(function (r) { var u = MAP.upgradeXY(r[1], r[2], 1); r[1] = u.x; r[2] = u.y; if (r[3]) r[3] = upPath(r[3]); });
	var PAINTED = "/gta-6-map/img/leonida-map.jpg?v=1";
	function drawBase() {
		var g = $("gm-base"); g.innerHTML = "";
		/* painted picture (MAP_V 2); the vector regions stay as invisible hit areas */
		el("image", { href: PAINTED, x: 0, y: 0, width: 1000, height: 1000, preserveAspectRatio: "none", "class": "gm-pic" }, g);
		REG.forEach(function (r) { if (r[3]) el("path", { d: r[3], "class": "gm-reg gm-hit", fill: r[4] }, g); });
		return drawGrid();
	}
	function drawSketch() {
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
		drawGrid();
	}
	function drawGrid() {
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
	var lastZ = 0;
	function unit() { return 1000 / Math.max(160, Math.min(stage.clientWidth || 600, stage.clientHeight || 600)); }
	function applyView() {
		V.z = Math.max(ZMIN, Math.min(ZMAX, V.z));
		if (lastZ && Math.abs(Math.log(V.z / lastZ)) > 0.08) { drawPins(); return; }
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
		if (ids.length === 1) drag = { x: e.clientX, y: e.clientY, tx: V.tx, ty: V.ty, moved: false, pin: e.target.closest("[data-pin]"), cl: e.target.closest("[data-cl]") };
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
		if (d.cl) { openCluster(d.cl); return; }
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
		if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
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
		hive: function (d, b) {
			var rec = b.mockRec; if (!rec) return { error: "that operation is not on the chain yet" };
			if (b.act === "hpin") { var c = MAP.pinFromRecord(rec); if (c.error) return { error: c.error }; var id = "mk" + Math.random().toString(36).slice(2, 8); d.p[id] = Object.assign(c.pin, { c: Date.now(), up: 0, dn: 0, own: 1, ha: b.acct, trx: b.trx }); mock.put(d); return { id: id, key: S.vid.split("").reverse().join(""), pin: Object.assign({ id: id }, d.p[id]) }; }
			var vt = MAP.voteFromRecord(rec); if (vt.error) return { error: vt.error };
			var p = d.p[vt.id]; if (!p) return { error: "pin not found" }; if (p.own || p.ha === b.acct) return { error: "you can’t vote on your own pin" };
			d.hv = d.hv || {}; var k = vt.id + "|" + b.acct, prev = d.hv[k] || 0, g = d.v[vt.id] || 0;
			if (g === 1) p.up--; if (g === -1) p.dn--; d.v[vt.id] = 0;
			p.hup = p.hup || 0; p.hdn = p.hdn || 0; if (prev === 1) p.hup--; if (prev === -1) p.hdn--; if (vt.v === 1) p.hup++; if (vt.v === -1) p.hdn++; d.hv[k] = vt.v; mock.put(d);
			return { up: p.up, dn: p.dn, hup: p.hup, hdn: p.hdn, mine: vt.v, hive: true };
		},
		call: function (body) {
			var d = mock.db();
			return new Promise(function (res) { setTimeout(function () { res(mock.answer(d, body)); }, 120); });
		},
		answer: function (d, b) {
			if (!b) { return { pins: Object.keys(d.p).map(function (id) { var p = d.p[id]; return Object.assign({ id: id }, p); }).filter(function (p) { return MAP.scoreOf(p) > -5; }), now: Date.now() }; }
			if (b.act === "new") { var c = MAP.cleanPin(b); if (c.error) return { error: c.error }; var id = "mk" + Math.random().toString(36).slice(2, 8); var key = S.vid.split("").reverse().join(""); d.p[id] = Object.assign(c.pin, { c: Date.now(), up: 0, dn: 0, own: 1 }); mock.put(d); return { id: id, key: key, pin: Object.assign({ id: id }, d.p[id]) }; }
			if (b.act === "hpin" || b.act === "hvote") return mock.hive(d, b);
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
	function myPins() { return S.my.map(function (m) { return Object.assign({ kind: "m", up: 0, dn: 0 }, m); }); }
	function allPins() { return PINS.concat(S.places !== false ? MAP.PLACES : [], myPins()); }
	function index() { byId = {}; PINS.forEach(function (p) { byId[p.id] = p; }); MAP.PLACES.forEach(function (p) { byId[p.id] = p; }); myPins().forEach(function (p) { byId[p.id] = p; }); }
	function refresh(quiet) {
		return call(null).then(function (d) {
			if (d.error) { if (!quiet) $("gm-count").textContent = d.error === "not set up" ? "The pin store isn’t switched on yet." : "Could not load the pins: " + d.error; return; }
			PINS = upPins(d.pins); index();
			Object.keys(S.mine).forEach(function (id) { if (!byId[id] && !quiet) { /* deleted or hidden: keep the key a while */ } });
			drawPins(); renderList(); if (openId && byId[openId]) openPin(openId, true);
		});
	}

	/* ======================= pins on the map ======================= */
	function pinG(p, parent, cls) {
		var g = el("g", { "class": "gm-pin " + (cls || "") + (p.kind ? " gm-pin--" + p.kind : "") + (S.found[p.id] ? " gm-pin--found" : ""), "data-x": p.x, "data-y": p.y }, parent);
		var st = p.kind ? "" : MAP.statusOf(p);
		el("path", { d: "M0,0 C-4,-9 -15,-14 -15,-26 A15,15 0 1 1 15,-26 C15,-14 4,-9 0,0 Z", "class": "gm-pinb", fill: catColor(p.cat) }, g);
		if (st === "verified") el("circle", { cx: 11, cy: -37, r: 6.5, "class": "gm-pinv" }, g);
		if (st === "disputed") el("circle", { cx: 11, cy: -37, r: 6.5, "class": "gm-pind" }, g);
		if (p.ha) el("circle", { cx: -11, cy: -37, r: 5.5, "class": "gm-pinh" }, g);
		if (p.kind === "k") el("path", { d: "M-11,-44 l6,6 l-6,6 l-6,-6 Z", "class": "gm-pink" }, g);
		if (p.kind === "m") el("rect", { x: -17, y: -43, width: 11, height: 9, rx: 2, "class": "gm-pinm" }, g);
		if (S.found[p.id]) { el("circle", { cx: 0, cy: 3, r: 7, "class": "gm-pinf" }, g); el("path", { d: "M-3.5,3 l2.5,2.6 l4.8,-5", "class": "gm-pinfk" }, g); }
		var t = el("text", { x: 0, y: -21, "text-anchor": "middle", "class": "gm-pini" }, g); t.textContent = ICON[p.cat] || "📍";
		return g;
	}
	function shownAll() {
		var list = MAP.filterPins(allPins(), { q: $("gm-q").value, cats: S.cats, verified: S.ver, hive: S.hiveOnly });
		if (S.mineOnly) list = list.filter(function (p) { return S.mine[p.id] || p.kind === "m"; });
		return MAP.sortPins(list, S.sort || "top");
	}
	function shown() { var l = shownAll(); return S.hideFound ? l.filter(function (p) { return !S.found[p.id]; }) : l; }
	function drawPins() {
		var g = $("gm-pins"); g.innerHTML = "";
		lastZ = V.z;
		var list = shown().filter(function (p) { return p.id !== openId; }), open = openId && byId[openId];
		var groups = MAP.clusterPins(list, 34 * unit() / V.z).sort(function (a, b) { return a.y - b.y; });   /* lower pins drawn on top */
		groups.forEach(function (c) {
			if (c.ids.length === 1) { pinOn(c.pins[0], g); return; }
			var cats = {}; c.pins.forEach(function (p) { cats[p.cat] = 1; }); var one = Object.keys(cats).length === 1;
			var e = el("g", { "class": "gm-cl", "data-x": c.x, "data-y": c.y, "data-cl": c.ids.join(","), tabindex: "0", role: "button", "aria-label": c.ids.length + " pins here: zoom in" }, g);
			el("circle", { r: 15 + Math.min(7, c.ids.length), "class": "gm-clb", fill: one ? catColor(c.pins[0].cat) : "#2b2350" }, e);
			var t = el("text", { y: 5, "text-anchor": "middle", "class": "gm-clt" }, e); t.textContent = c.ids.length;
		});
		if (open && list.length !== shown().length) pinOn(open, g);
		applyView();
	}
	function pinOn(p, g) { var e = pinG(p, g); e.setAttribute("data-pin", p.id); e.setAttribute("tabindex", "0"); e.setAttribute("role", "button"); e.setAttribute("aria-label", p.title); if (p.id === openId) e.classList.add("is-open"); return e; }
	function openCluster(node) {
		var ids = node.getAttribute("data-cl").split(","), xs = [], ys = [];
		ids.forEach(function (id) { var p = byId[id]; if (p) { xs.push(p.x); ys.push(p.y); } });
		if (!xs.length) return;
		var w = Math.max(20, Math.max.apply(null, xs) - Math.min.apply(null, xs)), h = Math.max(20, Math.max.apply(null, ys) - Math.min.apply(null, ys));
		var z = Math.min(ZMAX, Math.max(V.z * 2, 600 / Math.max(w, h)));
		if (V.z >= ZMAX - 0.01) { openPin(ids[0]); return; }
		V.z = z; V.tx = 500 - (Math.min.apply(null, xs) + w / 2) * z; V.ty = 500 - (Math.min.apply(null, ys) + h / 2) * z; applyView();
	}
	$("gm-pins").addEventListener("keydown", function (e) {
		if (e.key !== "Enter" && e.key !== " ") return;
		var c = e.target.closest("[data-cl]"), p = e.target.closest("[data-pin]");
		if (c) { e.preventDefault(); openCluster(c); } else if (p) { e.preventDefault(); openPin(p.getAttribute("data-pin")); }
	});

	/* ======================= pin card ======================= */
	var openId = null;
	function hiveBadge(p) { return MAP.hiveOk(p) ? ' <span class="gm-st gm-st--h" title="At least 2 Hive accounts say it\'s real">Hive ✓</span>' : ""; }
	function byLine(p) { return p.ha ? '<a class="gm-by" href="https://peakd.com/@' + esc(p.ha) + '" target="_blank" rel="noopener">' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(p.ha)) + '" width="18" height="18" loading="lazy">') + "@" + esc(p.ha) + "</a>" : ""; }
	function statusText(st) { return { verified: '<span class="gm-st gm-st--v">✓ Verified</span>', disputed: '<span class="gm-st gm-st--d">Disputed</span>', "new": '<span class="gm-st gm-st--n">New</span>' }[st] || ""; }
	function ago(ms) { var s = (Date.now() - ms) / 1000; if (s < 90) return "just now"; if (s < 5400) return Math.round(s / 60) + " min ago"; if (s < 129600) return Math.round(s / 3600) + " h ago"; return Math.round(s / 86400) + " days ago"; }
	function openPin(id, keep) {
		var p = byId[id]; if (!p) return;
		var wasClustered = openId !== id; openId = id; $("gm-ask").hidden = true;
		var k = p.kind || "", pop = $("gm-pop"), fd = S.found[id];
		var head = '<button type="button" class="gm-x" data-a="close" aria-label="Close">×</button>' +
			'<p class="gm-pk"><span class="gm-dot" style="background:' + catColor(p.cat) + '"></span>' + esc(MAP.catName(p.cat)) + (p.region ? " · " + esc(p.region) : "") + " · " + gridRef(p.x, p.y) + " " +
			(k === "k" ? '<span class="gm-st gm-st--k">MES guide</span>' : k === "m" ? '<span class="gm-st gm-st--m">🔒 Only you</span>' : statusText(MAP.statusOf(p)) + hiveBadge(p)) + "</p>";
		var found = '<div class="gm-fr"><button type="button" class="gm-fb' + (fd ? " is-on" : "") + '" data-a="found" aria-pressed="' + !!fd + '">' + (fd ? "✓ Found" : "☐ Mark as found") + "</button>" +
			(fd ? '<small>' + ago(fd) + "</small>" : "") + "</div>";
		var note = k === "m" ? "" : '<details class="gm-note"' + (S.notes[id] ? " open" : "") + '><summary>📝 My note' + (S.notes[id] ? "" : " (only you see it)") + '</summary><textarea data-a="note" rows="3" maxlength="2000" placeholder="Only saved in this browser">' + esc(S.notes[id] || "") + "</textarea></details>";
		var body;
		if (k === "m") {
			body = '<div class="gm-medit"><input type="text" data-a="mtitle" maxlength="70" value="' + esc(p.title) + '" aria-label="Title">' +
				'<textarea data-a="mnote" rows="4" maxlength="2000" placeholder="Your note (only saved in this browser)">' + esc(p.desc || "") + "</textarea></div>" + found +
				'<p class="gm-pf">Private marker · saved ' + ago(p.c) + ' · <button type="button" class="gm-lnk" data-a="mshare">Share it as a public pin</button> · <button type="button" class="gm-lnk" data-a="mdel">Delete</button></p>';
		} else if (k === "k") {
			body = "<h3>" + esc(p.title) + '</h3><p class="gm-pd">' + esc(p.desc) + "</p>" + found + note +
				'<p class="gm-pf">Approximate spot on our sketch, from the trailers and Rockstar’s region descriptions. It moves to the real spot when the map is redrawn after launch.</p>';
		} else {
			var mine = S.mine[id] || (p.ha && p.ha === me()), v = (signing() ? S.hvotes[me() + "|" + id] : S.votes[id]) || 0, sc = MAP.scoreOf(p), hu = p.hup || 0, hd = p.hdn || 0;
			body = "<h3>" + esc(p.title) + "</h3>" + (p.desc ? '<p class="gm-pd">' + esc(p.desc).replace(/\n/g, "<br>") + "</p>" : "") +
				(p.clip ? '<a class="gm-clip" href="https://www.youtube.com/watch?v=' + esc(p.clip) + '" target="_blank" rel="noopener"><img src="https://i.ytimg.com/vi/' + esc(p.clip) + '/mqdefault.jpg" alt="" loading="lazy" width="160" height="90"><span>▶ Watch the clip</span></a>' : "") +
				(p.ha ? '<p class="gm-pby">Added by ' + byLine(p) + (p.trx && !/^mock/.test(p.trx) ? ' · <a href="https://hivehub.dev/tx/' + esc(p.trx) + '" target="_blank" rel="noopener">on Hive</a>' : "") + "</p>" : "") +
				'<div class="gm-votes">' + (mine ? '<span class="gm-own">Your pin · score ' + (sc >= 0 ? "+" : "") + sc + " (" + p.up + " up, " + p.dn + " down" + (hu || hd ? "; Hive " + hu + " up, " + hd + " down" : "") + ")</span>" :
					'<button type="button" class="gm-vb gm-vb--up' + (v === 1 ? " is-on" : "") + '" data-a="up" aria-pressed="' + (v === 1) + '" title="It\'s real">▲ <b>' + (p.up + hu) + "</b>" + (hu ? '<small class="gm-hc">' + hu + " Hive</small>" : "") + "</button>" +
					'<button type="button" class="gm-vb gm-vb--dn' + (v === -1 ? " is-on" : "") + '" data-a="dn" aria-pressed="' + (v === -1) + '" title="Fake / not there">▼ <b>' + (p.dn + hd) + "</b>" + (hd ? '<small class="gm-hc">' + hd + " Hive</small>" : "") + "</button>" +
					'<span class="gm-vh">' + (signing() ? "Signed with Hive as @" + esc(me()) + " (counts double)" : v ? "Click again to take your vote back" : "Is it real?") + "</span>") + "</div>" + found + note +
				'<p class="gm-pf">Added ' + ago(p.c) + ' · <button type="button" class="gm-lnk" data-a="share">Copy link</button>' +
				(mine ? ' · <button type="button" class="gm-lnk" data-a="del">Delete my pin</button>' : ' · <button type="button" class="gm-lnk" data-a="report">Report</button>') + "</p>";
		}
		pop.innerHTML = head + body;
		pop.hidden = false; placePop();
		if (wasClustered && !keep) drawPins();
		Array.prototype.forEach.call(document.querySelectorAll("#gm-pins > g"), function (g) { g.classList.toggle("is-open", g.getAttribute("data-pin") === id); });
		Array.prototype.forEach.call(document.querySelectorAll("#gm-list li"), function (li) { li.classList.toggle("is-open", li.getAttribute("data-id") === id); });
		if (!keep && k !== "m") { var u = new URL(location.href); u.searchParams.set("pin", id); history.replaceState(null, "", u); }
	}
	function saveMy(id, f) { S.my.forEach(function (m) { if (m.id === id) f(m); }); save(); index(); }
	var noteT;
	$("gm-pop").addEventListener("input", function (e) {
		var a = e.target.getAttribute("data-a"), id = openId; if (!id) return;
		clearTimeout(noteT);
		noteT = setTimeout(function () {
			if (a === "note") { var t = e.target.value.trim(); if (t) S.notes[id] = e.target.value.slice(0, 2000); else delete S.notes[id]; save(); renderList(); }
			else if (a === "mtitle" && e.target.value.trim()) { saveMy(id, function (m) { m.title = e.target.value.trim().slice(0, 70); }); drawPins(); renderList(); }
			else if (a === "mnote") saveMy(id, function (m) { m.desc = e.target.value.slice(0, 2000); });
		}, 400);
	});
	function toggleFound(id) {
		if (S.found[id]) delete S.found[id]; else S.found[id] = Date.now();
		save(); drawPins(); renderList(); if (byId[id] && openId === id) openPin(id, true);
	}
	function closePop() {
		var had = openId; openId = null; $("gm-pop").hidden = true;
		if (had) drawPins();
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
		if (a === "found") return toggleFound(id);
		if (a === "mdel") { if (!confirm("Delete your private marker “" + p.title + "”?")) return; S.my = S.my.filter(function (m) { return m.id !== id; }); delete S.found[id]; save(); index(); closePop(); drawPins(); renderList(); toast("Marker deleted"); return; }
		if (a === "mshare") { var m = p; closePop(); setMode("add"); setPriv(false); $("gm-ftitle").value = m.title; $("gm-fdesc").value = m.desc || ""; pickCat(m.cat); setDraft(m.x, m.y); toast("Check the details, then press Pin it to share it with everyone."); return; }
		if (a === "up" || a === "dn") {
			var want = a === "up" ? 1 : -1, cur = (signing() ? S.hvotes[me() + "|" + id] : S.votes[id]) || 0, v = cur === want ? 0 : want;
			if (Date.now() - T0 < 900) return;
			var job = signing() ? signed("hvote", MAP.hiveVoteJson(id, v), (v === 1 ? "Vote real: " : v === -1 ? "Vote fake: " : "Take back my vote on: ") + p.title.slice(0, 60), b)
				: call({ act: "vote", id: id, vid: S.vid, v: v, t: Date.now() - T0 });
			job.then(function (d) {
				if (!d) return;
				if (d.error) { toast(d.error); return; }
				p.up = d.up; p.dn = d.dn; if (d.hup != null) { p.hup = d.hup; p.hdn = d.hdn; }
				var store = d.hive ? S.hvotes : S.votes, sk = d.hive ? me() + "|" + id : id; if (d.hive) delete S.votes[id];
				if (d.mine) store[sk] = d.mine; else delete store[sk]; save();
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
		var all = allPins(), counts = {}; all.forEach(function (p) { counts[p.cat] = (counts[p.cat] || 0) + 1; });
		$("gm-cats").innerHTML = '<button type="button" class="gm-chip' + (!S.cats.length ? " is-on" : "") + '" data-c="">All <small>' + all.length + "</small></button>" +
			MAP.PIN_CATS.map(function (c) { return '<button type="button" class="gm-chip' + (S.cats.indexOf(c[0]) >= 0 ? " is-on" : "") + (counts[c[0]] ? "" : " is-empty") + '" data-c="' + c[0] + '" aria-pressed="' + (S.cats.indexOf(c[0]) >= 0) + '"><span class="gm-dot" style="background:' + c[2] + '"></span>' + esc(c[1]) + " <small>" + (counts[c[0]] || 0) + "</small></button>"; }).join("");
	}
	$("gm-cats").addEventListener("click", function (e) {
		var b = e.target.closest("[data-c]"); if (!b) return;
		var c = b.getAttribute("data-c");
		if (!c) S.cats = []; else { var i = S.cats.indexOf(c); if (i >= 0) S.cats.splice(i, 1); else S.cats.push(c); }
		save(); drawPins(); renderList();
	});
	function renderList() {
		chips(); renderExplorers(); myCount();
		var list = shown(), base = shownAll(), all = allPins(), ol = $("gm-list"), nf = base.filter(function (p) { return S.found[p.id]; }).length;
		$("gm-count").textContent = all.length ? list.length + (list.length === 1 ? " pin" : " pins") + (list.length < all.length ? " of " + all.length : "") + (PINS.length ? "" : " · no community pins yet: be the first!") : "No pins yet: be the first! Click the map to add one.";
		var pr = $("gm-prog"); if (pr) { pr.hidden = !base.length; $("gm-progt").textContent = "Found " + nf + " of " + base.length + (S.cats.length || $("gm-q").value ? " in this list" : ""); $("gm-progb").style.width = (base.length ? 100 * nf / base.length : 0).toFixed(1) + "%"; }
		ol.innerHTML = list.slice(0, 300).map(function (p) {
			var k = p.kind, st = k ? "" : MAP.statusOf(p), sc = MAP.scoreOf(p), f = S.found[p.id];
			return '<li data-id="' + p.id + '" class="' + (p.id === openId ? "is-open" : "") + (f ? " is-found" : "") + '"><button type="button"><span class="gm-li-i" style="background:' + catColor(p.cat) + '">' + (ICON[p.cat] || "📍") + "</span>" +
				'<span class="gm-li-t"><b>' + esc(p.title) + "</b><small>" + esc(MAP.catName(p.cat)) + (p.region ? " · " + esc(p.region) : "") + (p.ha ? " · @" + esc(p.ha) : "") + (S.mine[p.id] ? " · yours" : "") + (S.notes[p.id] ? " · 📝" : "") + " " +
				(k === "k" ? '<span class="gm-st gm-st--k">MES guide</span>' : k === "m" ? '<span class="gm-st gm-st--m">🔒 Only you</span>' : statusText(st) + hiveBadge(p)) + "</small></span>" +
				(f ? '<span class="gm-li-f" title="Found">✓</span>' : k ? "" : '<span class="gm-li-s' + (sc > 0 ? " is-pos" : sc < 0 ? " is-neg" : "") + '">' + (sc > 0 ? "+" : "") + sc + "</span>") + "</button></li>";
		}).join("");
	}
	$("gm-list").addEventListener("click", function (e) { var li = e.target.closest("li[data-id]"); if (!li) return; var p = byId[li.getAttribute("data-id")]; if (!p) return; centreOn(p.x, p.y); openPin(p.id); if (window.innerWidth < 900) stage.scrollIntoView({ behavior: "smooth", block: "center" }); });
	var qT; $("gm-q").addEventListener("input", function () { clearTimeout(qT); qT = setTimeout(function () { drawPins(); renderList(); }, 120); });
	$("gm-sort").value = S.sort || "top"; $("gm-sort").addEventListener("change", function () { S.sort = this.value; save(); renderList(); });
	$("gm-ver").checked = !!S.ver; $("gm-ver").addEventListener("change", function () { S.ver = this.checked; save(); drawPins(); renderList(); });
	$("gm-hiveonly").checked = !!S.hiveOnly; $("gm-hiveonly").addEventListener("change", function () { S.hiveOnly = this.checked; save(); drawPins(); renderList(); });
	function renderExplorers() {
		var ex = MAP.explorers(PINS).slice(0, 20), ol = $("gm-explist");
		$("gm-exp").hidden = !ex.length;
		ol.innerHTML = ex.map(function (e) { return '<li><button type="button" data-acct="' + esc(e.acct) + '">' + (MOCK ? "" : '<img alt="" src="' + esc(avatar(e.acct)) + '" width="22" height="22" loading="lazy">') + "<b>@" + esc(e.acct) + "</b><small>" + e.verified + " verified · " + e.pins + (e.pins === 1 ? " pin" : " pins") + "</small></button></li>"; }).join("");
	}
	$("gm-explist").addEventListener("click", function (e) { var b = e.target.closest("[data-acct]"); if (!b) return; $("gm-q").value = "@" + b.getAttribute("data-acct"); S.hiveOnly = false; $("gm-hiveonly").checked = false; drawPins(); renderList(); });
	function flag(id, key, def) { var c = $(id); if (!c) return; c.checked = S[key] == null ? def : !!S[key]; c.addEventListener("change", function () { S[key] = c.checked; save(); if (openId && !byId[openId]) closePop(); drawPins(); renderList(); }); }
	flag("gm-places", "places", true); flag("gm-hidefound", "hideFound", false);
	$("gm-next").onclick = function () {
		var p = MAP.nextUnfound(shownAll(), S.found, openId);
		if (!p) { toast("You have found everything in this list!"); return; }
		centreOn(p.x, p.y, 3); openPin(p.id);
	};
	/* my map: backup / restore of finds, notes and private markers (nothing leaves the browser otherwise) */
	function myCount() { var m = $("gm-mycount"); if (m) m.textContent = S.my.length + " private " + (S.my.length === 1 ? "marker" : "markers") + " · " + Object.keys(S.found).length + " found · " + Object.keys(S.notes).length + (Object.keys(S.notes).length === 1 ? " note" : " notes"); }
	$("gm-backup").onclick = function () {
		var blob = new Blob([JSON.stringify({ app: "mes-gta-map", v: 1, saved: new Date().toISOString(), found: S.found, notes: S.notes, my: S.my }, null, 1)], { type: "application/json" });
		var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "gta-6-map-my-finds.json"; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
	};
	$("gm-restore").onclick = function () { $("gm-restorefile").click(); };
	$("gm-restorefile").onchange = function () {
		var f = this.files && this.files[0]; this.value = ""; if (!f) return;
		f.text().then(function (t) {
			var d; try { d = JSON.parse(t); } catch (e) { d = null; }
			if (!d || d.app !== "mes-gta-map") { toast("That is not a GTA 6 map backup file."); return; }
			var n = 0;
			Object.keys(d.found || {}).forEach(function (id) { if (!S.found[id] && typeof d.found[id] === "number") { S.found[id] = d.found[id]; n++; } });
			Object.keys(d.notes || {}).forEach(function (id) { if (!S.notes[id] && typeof d.notes[id] === "string") { S.notes[id] = d.notes[id].slice(0, 2000); n++; } });
			var have = {}; S.my.forEach(function (m) { have[m.id] = 1; });
			(Array.isArray(d.my) ? d.my : []).forEach(function (m) { if (!m || have[m.id] || !/^m-[a-z0-9]{4,12}$/.test(m.id || "")) return; var c = MAP.cleanMarker(m); if (c.error) return; S.my.push(Object.assign(c.m, { id: m.id, c: m.c || Date.now() })); n++; });
			save(); index(); drawPins(); renderList(); toast(n ? "Added " + n + " things from the backup." : "Nothing new in that backup.");
		});
	};
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
	function updWhere() {
		var fh = $("gm-fhive");
		if (fh) { fh.hidden = priv || !signing(); fh.innerHTML = signing() ? "This pin will be signed on Hive as <b>@" + esc(me()) + "</b>: a public, permanent record. mes.fm can hide it from the map but not erase it from the blockchain." : ""; } $("gm-where").innerHTML = draft ? "<b>1.</b> Spot picked: " + gridRef(draft.x, draft.y) + " (" + esc($("gm-freg").value) + "). Click again to move it." : "<b>1.</b> Click the map where it is."; $("gm-where").classList.toggle("is-done", !!draft); }
	$("gm-fcat").innerHTML = MAP.PIN_CATS.map(function (c) { return '<button type="button" class="gm-chip" role="radio" aria-checked="false" data-c="' + c[0] + '"><span>' + ICON[c[0]] + "</span> " + esc(c[1]) + "</button>"; }).join("");
	function pickCat(c) {
		fcat = c;
		Array.prototype.forEach.call($("gm-fcat").querySelectorAll("[data-c]"), function (x) { var on = x.getAttribute("data-c") === c; x.classList.toggle("is-on", on); x.setAttribute("aria-checked", on); });
		if (draft) setDraft(draft.x, draft.y);
	}
	$("gm-fcat").addEventListener("click", function (e) { var b = e.target.closest("[data-c]"); if (b) pickCat(b.getAttribute("data-c")); });
	var priv = false;
	function setPriv(on) {
		priv = !!on;
		Array.prototype.forEach.call(document.querySelectorAll("#gm-who [data-who]"), function (b) { var sel = (b.getAttribute("data-who") === "me") === priv; b.classList.toggle("is-on", sel); b.setAttribute("aria-checked", sel); });
		root.classList.toggle("gm-priv", priv);
		$("gm-fsave").textContent = priv ? "Save my marker" : "Pin it";
		$("gm-fdlab").firstChild.nodeValue = priv ? "My note " : "How to find it ";
		updWhere();
	}
	$("gm-who").addEventListener("click", function (e) { var b = e.target.closest("[data-who]"); if (b) setPriv(b.getAttribute("data-who") === "me"); });
	$("gm-freg").innerHTML = MAP.REGIONS.map(function (r) { return "<option>" + esc(r) + "</option>"; }).join("");
	$("gm-freg").addEventListener("change", function () { this.dataset.touched = "1"; updWhere(); });
	$("gm-fcancel").onclick = function () { $("gm-form").reset(); fcat = ""; setPriv(false); delete $("gm-freg").dataset.touched; Array.prototype.forEach.call($("gm-fcat").querySelectorAll(".is-on"), function (x) { x.classList.remove("is-on"); }); $("gm-ferr").textContent = ""; setMode("explore"); };
	$("gm-form").addEventListener("submit", function (e) {
		e.preventDefault();
		var err = $("gm-ferr"); err.textContent = "";
		if (!draft) { err.textContent = "Click the map first to put the pin where it is."; return; }
		if (priv) {
			var mk = MAP.cleanMarker({ x: draft.x, y: draft.y, cat: fcat || "other", title: $("gm-ftitle").value, desc: $("gm-fdesc").value, region: $("gm-freg").value });
			if (mk.error) { err.textContent = mk.error.charAt(0).toUpperCase() + mk.error.slice(1) + "."; return; }
			var mid = "m-" + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, "0");
			S.my.push(Object.assign(mk.m, { id: mid, c: Date.now() })); save(); index();
			$("gm-fcancel").onclick(); drawPins(); renderList(); openPin(mid); toast("Saved. Only you can see this marker.");
			return;
		}
		if (!fcat) { err.textContent = "Pick what kind of thing it is."; return; }
		var body = { act: "new", x: draft.x, y: draft.y, cat: fcat, title: $("gm-ftitle").value, desc: $("gm-fdesc").value, region: $("gm-freg").value, clip: $("gm-fclip").value.trim(), vid: S.vid, t: Date.now() - T0 };
		if ($("gm-fhp").value) body.hp = $("gm-fhp").value;
		if (signing() && !body.hp) {
			var hc = MAP.cleanPin({ x: body.x, y: body.y, cat: body.cat, title: body.title, desc: body.desc, region: body.region, clip: body.clip });
			if (hc.error) { err.textContent = hc.error.charAt(0).toUpperCase() + hc.error.slice(1) + "."; return; }
			$("gm-fsave").disabled = true;
			signed("hpin", MAP.hivePinJson(hc.pin), "Pin on the GTA 6 map: " + hc.pin.title, $("gm-fsave"), err).then(function (d) {
				$("gm-fsave").disabled = false;
				if (!d) return;
				if (d.error) { err.textContent = d.error.charAt(0).toUpperCase() + d.error.slice(1) + "."; return; }
				err.textContent = "";
				S.mine[d.id] = d.key; save();
				if (d.pin) { PINS.push(d.pin); byId[d.id] = d.pin; }
				$("gm-fcancel").onclick(); drawPins(); renderList(); openPin(d.id); toast("Pinned and signed on Hive as @" + me() + ".");
			});
			return;
		}
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

	/* ======================= Hive (optional) ======================= */
	var HV = window.MESHive || null, MOCKACCT = "mes-gta-map:mockacct";
	function me() { var u = HV && HV.user && HV.user(); if (u) return u.name; if (MOCK) try { return sessionStorage.getItem(MOCKACCT) || ""; } catch (e) {} return ""; }
	function signing() { return !!me() && S.hsign !== false; }
	function avatar(n) { return HV && HV.avatar ? HV.avatar(n, "small") : "https://images.hive.blog/u/" + encodeURIComponent(n) + "/avatar/small"; }
	function realUser() { return !!(HV && HV.user && HV.user()); }
	function renderHive() {
		var box = $("gm-hive"), u = me(); if (!box) return;
		if (u) {
			box.innerHTML = '<div class="gm-hrow">' + (realUser() ? '<img alt="" src="' + esc(avatar(u)) + '" width="26" height="26">' : "") + "<b>@" + esc(u) + '</b><button type="button" class="gm-lnk" data-h="out">Log out</button></div>' +
				'<label class="gm-chk"><input type="checkbox" data-h="sign"' + (S.hsign !== false ? " checked" : "") + "> Sign my pins and votes with Hive (votes count double)</label>";
			box.querySelector('[data-h="out"]').onclick = function () { if (realUser()) HV.logout(); else try { sessionStorage.removeItem(MOCKACCT); } catch (e) {} renderHive(); updWhere(); if (openId) openPin(openId, true); };
			box.querySelector('[data-h="sign"]').onchange = function () { S.hsign = this.checked; save(); updWhere(); if (openId) openPin(openId, true); };
		} else {
			box.innerHTML = '<details class="gm-hlog"><summary><b>Sign in with Hive</b> <small>(optional: your name on pins, votes count double)</small></summary>' +
				'<div class="gm-hrow"><input type="text" data-h="user" placeholder="Hive username" autocomplete="username" spellcheck="false" aria-label="Hive username"><button type="button" class="tu-btn" data-h="in">Log in</button></div>' +
				'<p class="tu-note">' + (MOCK ? "Test copy: any username works and nothing is signed." : "Hive Keychain (the extension, or the Keychain phone app) proves the account is yours by signing a message. Your keys never leave Keychain.") + '</p><div data-h="help"></div></details>';
			var inp = box.querySelector('[data-h="user"]'), btn = box.querySelector('[data-h="in"]');
			var go = function () {
				var n = (inp.value || "").trim().replace(/^@/, "").toLowerCase();
				if (!/^[a-z][a-z0-9.-]{2,15}$/.test(n)) { toast("That is not a Hive username."); return; }
				if (MOCK && !(HV && HV.hasKeychain && HV.hasKeychain())) { try { sessionStorage.setItem(MOCKACCT, n); } catch (e) {} renderHive(); updWhere(); return; }
				if (!HV) { toast("The Hive helpers did not load: reload the page."); return; }
				btn.disabled = true; btn.textContent = "Check Keychain…";
				HV.login(n).then(function () { toast("Signed in as @" + n + "."); renderHive(); updWhere(); if (openId) openPin(openId, true); }, function (e) {
					btn.disabled = false; btn.textContent = "Log in";
					toast((e && e.message) || "Could not log in.");
					if (e && e.code === "nokeychain" && HV.helpHtml) box.querySelector('[data-h="help"]').innerHTML = HV.helpHtml();
				});
			};
			btn.onclick = go; inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
		}
	}
	if (HV && HV.onChange) HV.onChange(function () { renderHive(); renderList(); updWhere(); });
	/* sign one custom_json, then let the API check it on the chain (it retries while the block is not in yet) */
	function signed(act, json, label, btn, msgEl) {
		var u = me(), say = function (t) { if (msgEl) msgEl.textContent = t; else toast(t); };
		say("Waiting for Hive Keychain…");
		var p = MOCK && !realUser() ? Promise.resolve({ trx: "mock" + Date.now().toString(16), mockRec: JSON.parse(json) }) : (HV ? HV.keychain() : Promise.resolve(null)).then(function (kc) {
			if (!kc) { var e = new Error("Hive Keychain is not available in this browser. Log in again, or untick “Sign my pins and votes with Hive”."); e.code = "nokeychain"; throw e; }
			return new Promise(function (ok, no) {
				kc.requestCustomJson(u, MAP.HIVE_ID, "Posting", json, label, function (r) {
					if (r && r.success) { var x = r.result || {}; ok({ trx: String(x.id || x.tx_id || x.trx_id || "").toLowerCase() }); }
					else no(HV.kcError ? HV.kcError(r, "Cancelled in Keychain") : new Error((r && r.message) || "Cancelled in Keychain"));
				});
			});
		});
		return p.then(function (res) {
			if (!res.trx) return { error: "Keychain did not return a transaction id" };
			say("Signed. Checking it on the Hive blockchain…");
			return (function check(tries) {
				return call({ act: act, acct: u, trx: res.trx, vid: S.vid, mockRec: res.mockRec }).then(function (d) {
					if (d && d.error && /not on the chain yet/.test(d.error) && tries < 8) { say("Waiting for the next Hive block… (" + (tries + 1) + ")"); return new Promise(function (r) { setTimeout(r, 3500); }).then(function () { return check(tries + 1); }); }
					if (msgEl && !(d && d.error)) msgEl.textContent = "";
					return d;
				});
			})(0);
		}, function (e) {
			say((e && e.message) || "Not signed.");
			if (btn) btn.disabled = false;
			return null;
		});
	}

	/* ======================= fill window, start ======================= */
	function boot() {
		if (window.MESPanel) window.MESPanel.add($("gm-view"), { bar: $("gm-bar").querySelector(".gm-tools"), stage: stage, onChange: function () { setTimeout(applyView, 30); } });
		else setTimeout(boot, 150);
	}
	drawBase(); fit(); setMode("explore"); renderList(); renderHive(); boot();
	window.addEventListener("resize", function () { applyView(); });
	var want = new URLSearchParams(location.search).get("pin");
	refresh().then(function () { if (want && byId[want]) { centreOn(byId[want].x, byId[want].y, 3); openPin(want, true); } });
	setInterval(function () { if (!document.hidden && mode === "explore" && !drag) refresh(true); }, 60000);
	window.MESGTAMapDebug = { me: me, signing: signing, signed: signed, V: V, S: S, pins: function () { return PINS; }, refresh: refresh, setDraft: setDraft, setMode: setMode, openPin: openPin, mapPt: mapPt, mock: mock };
})();
