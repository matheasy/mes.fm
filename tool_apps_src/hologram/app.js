/* MES Hologram Simulator (mes.fm/hologram). Maths in lib.js (MESHolo). Tabs (?tab=):
 * rec   = side view of the recording (draggable object points, animated wave crests) + the fringe pattern |R + ΣO|² on a zoomable patch of the plate, partial coherence;
 * view  = numerical record + playback on an N x N plate: hologram, its spectrum (click to block a part), the image at any focus, a small camera opening for parallax;
 * coh   = coherence length and fringe contrast, motion during the exposure;
 * types = transmission, in-line, reflection (Kogelnik Bragg curve), rainbow, embossed, Pepper's ghost (&type=);
 * cgh   = Gerchberg-Saxton phase-only hologram of a picture you draw.
 * State: localStorage mes-hologram:v1. */
(function () {
	"use strict";
	var H = window.MESHolo, root = document.getElementById("hg"); if (!H || !root) return;
	var $ = function (id) { return document.getElementById(id); }, KEY = "mes-hologram:v1", DEG = Math.PI / 180, TAU = Math.PI * 2;
	var DEF = {
		tab: "rec",
		r: { lam: 633, th: 25, k: 0.5, src: "ideal", dl: 0, z: 1.7, pu: 0, pv: 0, sel: 0, pts: [{ z: 30, u: 2, v: 0, a: 1 }, { z: 48, u: -3.5, v: 1, a: 0.8 }] },
		v: { pre: "pts3", th: 10, k: 0.5, light: 1, k0: false, k1: true, k2: false, f: -1200, cam: false, eu: 0, ev: 0, er: 0.25, g: 0.5, diff: false, mk: true, N: 256 },
		c: { src: "hene", w: -5.7, x: 0.4, m: 0 },
		t: { type: "trans", p: {} },
		g: { lv: 0, it: 60, d: 100, off: true, pen: 1, pre: "mes" }
	};
	var S = JSON.parse(JSON.stringify(DEF));
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) for (var k in DEF) { if (typeof DEF[k] === "object") { for (var j in DEF[k]) if (sv[k] && sv[k][j] != null) S[k][j] = sv[k][j]; } else if (sv[k] != null) S[k] = sv[k]; } } catch (e) { /* ignore */ }
	if (!Array.isArray(S.r.pts) || !S.r.pts.length) S.r.pts = JSON.parse(JSON.stringify(DEF.r.pts));
	var saveT = null;
	function save() { clearTimeout(saveT); saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }, 200); }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
	var fmt = H.sig, len = H.len;
	function maxH() { return Math.round(window.innerHeight * 0.78); }
	function fitCanvas(c, aspect, minH, mh) {
		var full = document.fullscreenElement && document.fullscreenElement.contains(c);
		var w = Math.max(260, full ? Math.min(window.innerWidth, window.innerHeight / aspect) : (c.parentNode.clientWidth || 600)), h = Math.round(w * aspect);
		h = Math.max(minH || 180, Math.min(full ? window.innerHeight : (mh || 9999), h));
		var d = Math.min(2, window.devicePixelRatio || 1);
		if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); c.style.height = h + "px"; }
		var x = c.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0); return { x: x, w: w, h: h };
	}
	function text(x, t, px, py, size, col, al, base, bold) { x.font = (bold ? "600 " : "") + (size || 13) + "px system-ui,Helvetica,Arial,sans-serif"; x.fillStyle = col || "#cfd6e6"; x.textAlign = al || "left"; x.textBaseline = base || "middle"; x.fillText(t, px, py); }
	function line(x, x0, y0, x1, y1, col, wd, dash) { x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.strokeStyle = col; x.lineWidth = wd || 1.5; x.setLineDash(dash || []); x.stroke(); x.setLineDash([]); }
	function arrow(x, x0, y0, x1, y1, col, wd) { line(x, x0, y0, x1, y1, col, wd); var a = Math.atan2(y1 - y0, x1 - x0), s = 9; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x1 - s * Math.cos(a - 0.4), y1 - s * Math.sin(a - 0.4)); x.lineTo(x1 - s * Math.cos(a + 0.4), y1 - s * Math.sin(a + 0.4)); x.closePath(); x.fillStyle = col; x.fill(); }
	function rgb(nm, a) { var c = H.waveRGB(nm); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a == null ? 1 : a) + ")"; }
	function card(h, big, small, cls) { return "<div class='hg-card'><h4>" + h + "</h4><span class='hg-big" + (cls ? " " + cls : "") + "'>" + big + "</span>" + (small ? "<small>" + small + "</small>" : "") + "</div>"; }
	function sw(nm) { var c = H.waveRGB(nm); return "<span class='hg-sw' style='background:rgb(" + c.join(",") + ")'></span>"; }
	function ptr(c, e) { var r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
	function bindRange(id, get, set, show, after) {
		var el = $(id); if (!el) return function () {};
		function paint() { el.value = get(); var v = $(id + "-v"); if (v) v.textContent = show(Number(el.value)); }
		el.addEventListener("input", function () { set(Number(el.value)); paint(); save(); if (after) after(); });
		paint(); return paint;
	}
	function segInit(id, get, set, after) {
		var el = $(id); function paint() { [].forEach.call(el.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(get()) === b.getAttribute("data-v") ? "true" : "false"); }); }
		paint(); el.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; set(b.getAttribute("data-v")); paint(); save(); if (after) after(); });
		return paint;
	}
	function checkInit(id, get, set, after) { var el = $(id); el.checked = !!get(); el.addEventListener("change", function () { set(el.checked); save(); if (after) after(); }); return function () { el.checked = !!get(); }; }
	function chips(id, list, get, set) {
		var el = $(id); el.innerHTML = list.map(function (c) { return "<button type='button' data-v='" + c[0] + "'>" + esc(c[1]) + "</button>"; }).join("");
		function paint() { [].forEach.call(el.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", get() === b.getAttribute("data-v") ? "true" : "false"); }); }
		el.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; set(b.getAttribute("data-v")); paint(); save(); });
		paint(); return paint;
	}
	var dirty = {};
	function mark(what) { dirty[what] = true; }

	/* ---------------------------------------------------------------- tabs */
	var TABS = ["rec", "view", "coh", "types", "cgh"], tabs = [].slice.call(root.querySelectorAll(".hg-tabs button")), panels = [].slice.call(root.querySelectorAll("[data-panel]"));
	function showTab(t, keep) {
		if (TABS.indexOf(t) < 0) t = "rec";
		S.tab = t; tabs.forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
		panels.forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== t; });
		if (!keep) save(); redrawAll();
	}
	tabs.forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); }); });
	root.addEventListener("click", function (e) {
		var fs = e.target.closest("[data-fs]"); if (fs) { var st = fs.closest(".hg-stage"); if (document.fullscreenElement) document.exitFullscreen(); else if (st.requestFullscreen) st.requestFullscreen(); return; }
		var g = e.target.closest("[data-goto]"); if (g) { if (g.getAttribute("data-th") != null) { S.v.th = Number(g.getAttribute("data-th")); syncView(); } showTab(g.getAttribute("data-goto")); root.scrollIntoView({ behavior: "smooth", block: "start" }); }
	});
	document.addEventListener("fullscreenchange", function () { setTimeout(redrawAll, 60); });

	/* ================================================================ 1. RECORDING */
	var R = S.r, PCOL = ["#ffd166", "#5ec8ff", "#ff6fb5", "#7ee081", "#c79bff", "#ff9b5e"], rs = $("hg-rs"), rp = $("hg-rp");
	var srcSel = $("hg-r-src"); srcSel.innerHTML = H.SOURCES.map(function (s) { return "<option value='" + s.id + "'>" + esc(s.name) + "</option>"; }).join("");
	function source(id) { return H.SOURCES.filter(function (s) { return s.id === id; })[0] || H.SOURCES[0]; }
	function rLc() { var s = source(R.src); return s.id === "ideal" ? Infinity : H.coherenceLength(R.lam / 1000, s.dlam * Math.pow(R.lam / 1000 / s.lam, 2)); }   // same coherence length for any colour
	function rMeanZ() { var s = 0; R.pts.forEach(function (p) { s += p.z; }); return R.pts.length ? s / R.pts.length : 30; }
	function rOpt() {
		var sa = 0; R.pts.forEach(function (p) { sa += p.a * p.a; });
		return { lam: R.lam / 1000, thetaR: R.th, ampR: Math.sqrt(Math.pow(10, R.k) * (sa || 1)), Lc: rLc(), refPath: (rMeanZ() + R.dl) * 1000 };
	}
	function rPtsUm() { return R.pts.map(function (p) { return { u: p.u * 1000, v: p.v * 1000, z: p.z * 1000, a: p.a }; }); }
	srcSel.value = R.src; srcSel.addEventListener("change", function () { R.src = srcSel.value; save(); mark("rp"); rCards(); });
	var pLam = bindRange("hg-r-lam", function () { return R.lam; }, function (v) { R.lam = v; }, function (v) { return v + " nm (" + H.colourName(v) + ")"; }, function () { mark("rp"); rCards(); });
	var pTh = bindRange("hg-r-th", function () { return R.th; }, function (v) { R.th = v; }, function (v) { return fmt(v, 3) + "°"; }, function () { mark("rp"); rCards(); });
	var pK = bindRange("hg-r-k", function () { return R.k; }, function (v) { R.k = v; }, function (v) { return fmt(Math.pow(10, v), 2) + " : 1"; }, function () { mark("rp"); rCards(); });
	var pZ = bindRange("hg-r-z", function () { return R.z; }, function (v) { R.z = v; }, function (v) { return len(Math.pow(10, v)) + " wide"; }, function () { mark("rp"); });
	var pDl = bindRange("hg-r-dl", function () { return R.dl; }, function (v) { R.dl = v; }, function (v) { return (v > 0 ? "+" : "") + fmt(v, 3) + " mm"; }, function () { mark("rp"); rCards(); });
	var RPRE = [
		["one", "One point", { th: 25, pts: [{ z: 35, u: 0, v: 0, a: 1 }] }],
		["two", "Two points", { th: 25, pts: [{ z: 30, u: 2, v: 0, a: 1 }, { z: 48, u: -3.5, v: 1, a: 0.8 }] }],
		["three", "Three depths", { th: 30, pts: [{ z: 15, u: 3, v: 0, a: 1 }, { z: 40, u: 0, v: -1, a: 0.9 }, { z: 70, u: -4, v: 1, a: 0.8 }] }],
		["far", "Far point = a grating", { th: 20, z: 1.3, pts: [{ z: 85, u: 0, v: 0, a: 1 }] }],
		["gabor", "In-line (Gabor)", { th: 0, z: 3.2, pts: [{ z: 25, u: 0, v: 0, a: 0.6 }] }]
	];
	var pRpre = chips("hg-r-pre", RPRE.map(function (p) { return [p[0], p[1]]; }), function () { return R.pre || ""; }, function (v) {
		var p = RPRE.filter(function (q) { return q[0] === v; })[0]; R.pre = v; R.pts = JSON.parse(JSON.stringify(p[2].pts)); R.th = p[2].th; R.sel = 0; R.pu = 0; R.pv = 0; if (p[2].z) R.z = p[2].z;
		pTh(); pZ(); rPtsUI(); mark("rp"); rCards();
	});
	// object point rows
	var ptsBox = $("hg-r-pts");
	function rPtsUI() {
		ptsBox.innerHTML = R.pts.map(function (p, i) {
			function rg(key, lab, mn, mx, st) { return "<label" + (key === "a" ? " class='hg-wide'" : "") + ">" + lab + " <b data-pv='" + i + key + "'></b><input type='range' min='" + mn + "' max='" + mx + "' step='" + st + "' data-pi='" + i + "' data-pk='" + key + "' value='" + p[key] + "'></label>"; }
			return "<div class='hg-pt" + (i === R.sel ? " is-sel" : "") + "' data-row='" + i + "'><span class='hg-dot' style='background:" + PCOL[i % PCOL.length] + "' aria-hidden='true'></span>" +
				rg("z", "Distance", 5, 85, 0.1) + rg("u", "Height", -10, 10, 0.05) + rg("v", "Sideways", -10, 10, 0.05) +
				"<button type='button' data-del='" + i + "' aria-label='Remove point " + (i + 1) + "'" + (R.pts.length < 2 ? " disabled" : "") + ">✕</button>" + rg("a", "Brightness", 0.1, 1, 0.01) + "</div>";
		}).join("") + "<div class='hg-ptbar'><button type='button' class='hg-ptadd' id='hg-r-add'" + (R.pts.length >= 6 ? " disabled" : "") + ">+ Add a point</button><span class='tu-note'>Up to six points. Distance = in front of the plate; height and sideways are across it.</span></div>";
		rPtsVals(); pRpre();
	}
	function rPtsVals() {
		R.pts.forEach(function (p, i) { ["z", "u", "v", "a"].forEach(function (k) { var b = ptsBox.querySelector("[data-pv='" + i + k + "']"), inp = ptsBox.querySelector("[data-pi='" + i + "'][data-pk='" + k + "']"); if (inp && document.activeElement !== inp) inp.value = p[k]; if (b) b.textContent = k === "a" ? Math.round(p[k] * 100) + " %" : fmt(p[k], 3) + " mm"; }); });
		[].forEach.call(ptsBox.querySelectorAll(".hg-pt"), function (r) { r.classList.toggle("is-sel", Number(r.getAttribute("data-row")) === R.sel); });
	}
	ptsBox.addEventListener("input", function (e) { var el = e.target; if (el.getAttribute("data-pk") == null) return; var i = Number(el.getAttribute("data-pi")); R.pts[i][el.getAttribute("data-pk")] = Number(el.value); R.sel = i; R.pre = ""; rPtsVals(); pRpre(); save(); mark("rp"); rCards(); });
	ptsBox.addEventListener("click", function (e) {
		var d = e.target.closest("[data-del]"); if (d) { R.pts.splice(Number(d.getAttribute("data-del")), 1); R.sel = 0; R.pre = ""; rPtsUI(); save(); mark("rp"); rCards(); return; }
		if (e.target.closest("#hg-r-add")) { if (R.pts.length < 6) { R.pts.push({ z: 20 + 10 * R.pts.length, u: (R.pts.length % 2 ? -1 : 1) * 2, v: 0, a: 0.8 }); R.sel = R.pts.length - 1; R.pre = ""; rPtsUI(); save(); mark("rp"); rCards(); } return; }
		var row = e.target.closest(".hg-pt"); if (row && !e.target.closest("input")) { R.sel = Number(row.getAttribute("data-row")); rPtsVals(); }
	});
	// side view geometry
	function rsGeo(w, h) { var plateX = w - 58, s = Math.min((h - 64) / 24, (plateX - 34) / 90); return { px: plateX, cy: h / 2 + 4, s: s }; }
	var rsT = 0;
	function rsDraw() {
		var f = fitCanvas(rs, 0.48, 230, maxH()), x = f.x, w = f.w, h = f.h, g = rsGeo(w, h), lam = R.lam, col = rgb(lam), sp = 3.5, ph = (rsT * 2.2) % sp;
		x.fillStyle = "#070a12"; x.fillRect(0, 0, w, h);
		x.save(); x.beginPath(); x.rect(0, 0, g.px, h); x.clip();
		// reference crests: lines perpendicular to the beam direction (toward the plate, tilted by θ)
		var th = R.th * DEG, dx = Math.cos(th), dy = -Math.sin(th), L = Math.hypot(w, h);
		x.globalAlpha = 0.45;
		for (var m = -60; m <= 2; m++) {
			var c = (m * sp + ph) * g.s, cx = g.px + c * dx, cy = g.cy + c * dy;
			line(x, cx - dy * L, cy + dx * L, cx + dy * L, cy - dx * L, rgb(lam, 0.55), 1.2);
		}
		x.globalAlpha = 1;
		// object crests: circles around each point
		R.pts.forEach(function (p, i) {
			var ox = g.px - p.z * g.s, oy = g.cy - p.u * g.s, rmax = Math.hypot(g.px - ox, h) + 10;
			x.strokeStyle = PCOL[i % PCOL.length]; x.globalAlpha = 0.5 * p.a + 0.15; x.lineWidth = 1.2;
			for (var r = ph; r * g.s < rmax; r += sp) { if (r <= 0.05) continue; x.beginPath(); x.arc(ox, oy, r * g.s, -Math.PI / 2, Math.PI / 2); x.stroke(); }
			x.globalAlpha = 1;
		});
		x.restore();
		// reference beam label arrow
		var ax = g.px - 0.62 * (g.px - 20), ay = g.cy + Math.tan(th) * (g.px - ax);
		if (Math.abs(ay - g.cy) < h / 2 - 20) arrow(x, ax - dx * 46, ay - dy * 46, ax, ay, col, 3);
		text(x, "Reference beam · " + fmt(R.th, 3) + "°", 10, h - 14, 12, col);
		// plate
		x.fillStyle = "#9fb3c8"; x.fillRect(g.px, g.cy - 10 * g.s, 6, 20 * g.s);
		text(x, "plate", g.px + 3, g.cy - 10 * g.s - 10, 12, "#cfd6e6", "center");
		var my = g.cy - (R.pu / 1000) * g.s; x.fillStyle = "#fff"; x.beginPath(); x.moveTo(g.px + 8, my); x.lineTo(g.px + 18, my - 6); x.lineTo(g.px + 18, my + 6); x.closePath(); x.fill();
		text(x, "patch", g.px + 21, my, 11, "#fff");
		// distance ruler
		for (var z = 0; z <= 80; z += 10) { var tx = g.px - z * g.s; line(x, tx, h - 30, tx, h - 25, "#55607a", 1); if (z % 20 === 0) text(x, z + " mm", tx, h - 36, 10, "#8792a8", "center"); }
		// points
		R.pts.forEach(function (p, i) {
			var ox = g.px - p.z * g.s, oy = g.cy - p.u * g.s;
			x.beginPath(); x.arc(ox, oy, 8, 0, TAU); x.fillStyle = PCOL[i % PCOL.length]; x.fill();
			if (i === R.sel) { x.lineWidth = 2.5; x.strokeStyle = "#fff"; x.stroke(); }
			text(x, String(i + 1), ox, oy + 0.5, 11, "#0b0f1a", "center", "middle", true);
		});
		text(x, "Wave crests drawn " + sp + " mm apart; real ones are " + Math.round(R.lam) + " nm apart (" + fmt(sp * 1e6 / R.lam, 2) + "× closer)", 10, 16, 12, "#aeb8cc");
	}
	var rsDrag = null;
	function rsHit(pt) { var g = rsGeo(rs.clientWidth, rs.clientHeight), best = -1, bd = 18; R.pts.forEach(function (p, i) { var d = Math.hypot(pt.x - (g.px - p.z * g.s), pt.y - (g.cy - p.u * g.s)); if (d < bd) { bd = d; best = i; } }); return best; }
	function rsMove(i, pt) { var g = rsGeo(rs.clientWidth, rs.clientHeight), p = R.pts[i]; p.z = Math.max(5, Math.min(85, (g.px - pt.x) / g.s)); p.u = Math.max(-10, Math.min(10, (g.cy - pt.y) / g.s)); p.z = Math.round(p.z * 10) / 10; p.u = Math.round(p.u * 20) / 20; R.pre = ""; }
	rs.addEventListener("pointerdown", function (e) { var pt = ptr(rs, e), i = rsHit(pt); rsDrag = { i: i, x: pt.x, y: pt.y, moved: false }; if (i >= 0) { R.sel = i; rPtsVals(); } rs.setPointerCapture(e.pointerId); });
	rs.addEventListener("pointermove", function (e) { if (!rsDrag) return; var pt = ptr(rs, e); if (Math.hypot(pt.x - rsDrag.x, pt.y - rsDrag.y) > 3) rsDrag.moved = true; if (rsDrag.i >= 0 && rsDrag.moved) { rsMove(rsDrag.i, pt); rPtsVals(); pRpre(); mark("rp"); rCards(); } });
	rs.addEventListener("pointerup", function (e) {
		if (!rsDrag) return; var pt = ptr(rs, e), g = rsGeo(rs.clientWidth, rs.clientHeight);
		if (rsDrag.i < 0 && !rsDrag.moved && pt.x < g.px - 5 * g.s && R.pts.length < 6) { R.pts.push({ z: 30, u: 0, v: 0, a: 0.8 }); R.sel = R.pts.length - 1; rsMove(R.sel, pt); rPtsUI(); mark("rp"); rCards(); }
		rsDrag = null; save();
	});
	rs.addEventListener("keydown", function (e) { var p = R.pts[R.sel]; if (!p) return; var d = e.shiftKey ? 2 : 0.5, used = true; if (e.key === "ArrowLeft") p.z = Math.min(85, p.z + d); else if (e.key === "ArrowRight") p.z = Math.max(5, p.z - d); else if (e.key === "ArrowUp") p.u = Math.min(10, p.u + d); else if (e.key === "ArrowDown") p.u = Math.max(-10, p.u - d); else if (e.key === "Tab") used = false; else if (/^[1-6]$/.test(e.key) && R.pts[Number(e.key) - 1]) R.sel = Number(e.key) - 1; else used = false; if (used) { e.preventDefault(); R.pre = ""; rPtsVals(); mark("rp"); rCards(); save(); } });
	// the plate patch
	var rpOff = document.createElement("canvas");
	function rpDraw() {
		var f = fitCanvas(rp, 0.52, 230, maxH()), x = f.x, w = f.w, h = f.h, hi = h - 78, W = Math.pow(10, R.z), Hh = W * hi / w;
		var cols = Math.max(80, Math.min(340, Math.floor(w / 2))), rows = Math.max(30, Math.round(cols * hi / w)), du = W / cols, o = rOpt(), pts = rPtsUm(), Imax = Math.pow(o.ampR + pts.reduce(function (s, p) { return s + p.a; }, 0), 2);
		var spc = rSpacing(), ss = spc < 3 * du ? 3 : 1, col = H.waveRGB(R.lam);
		if (rpOff.width !== cols || rpOff.height !== rows) { rpOff.width = cols; rpOff.height = rows; }
		var ox = rpOff.getContext("2d"), img = ox.createImageData(cols, rows), d = img.data;
		for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
			var acc = 0;
			for (var a = 0; a < ss; a++) for (var b = 0; b < ss; b++) {
				var u = R.pu + (c + (a + 0.5) / ss - cols / 2) * du, v = R.pv - (r + (b + 0.5) / ss - rows / 2) * du;
				acc += H.recordAt(pts, u, v, o);
			}
			var t = Math.min(1, acc / (ss * ss) / Imax), q = (r * cols + c) * 4, br = Math.pow(t, 0.8);
			d[q] = col[0] * br + 10 * (1 - br); d[q + 1] = col[1] * br + 10 * (1 - br); d[q + 2] = col[2] * br + 18 * (1 - br); d[q + 3] = 255;
		}
		ox.putImageData(img, 0, 0);
		x.fillStyle = "#070a12"; x.fillRect(0, 0, w, h);
		x.imageSmoothingEnabled = ss === 1 && du > 0.08; x.drawImage(rpOff, 0, 0, w, hi); x.imageSmoothingEnabled = true;
		// scale bar
		var nice = Math.pow(10, Math.floor(Math.log10(W / 4))), bar = nice * (W / 4 / nice >= 5 ? 5 : W / 4 / nice >= 2 ? 2 : 1), bp = bar / W * w;
		x.fillStyle = "rgba(7,10,18,0.7)"; x.fillRect(8, hi - 34, bp + 16, 28); line(x, 16, hi - 14, 16 + bp, hi - 14, "#fff", 3); text(x, len(bar), 16 + bp / 2, hi - 24, 11, "#fff", "center");
		text(x, "Plate patch " + len(W) + " × " + len(Hh) + (R.pu || R.pv ? " · centre " + fmt(R.pu / 1000, 3) + ", " + fmt(R.pv / 1000, 3) + " mm" : ""), 10, 14, 12, "#e6ebf5");
		if (spc < 2 * W / w) text(x, "Fringes " + len(spc) + " apart: too fine to see at this zoom, they blur to grey. Zoom in.", 10, 32, 12, "#ffcf70");
		// profile along the middle row
		var py0 = hi + 10, ph = h - hi - 20; x.fillStyle = "#0d1220"; x.fillRect(0, hi, w, h - hi);
		line(x, 0, py0 + ph, w, py0 + ph, "#3a4258", 1); x.beginPath();
		var n = Math.min(900, w * 2);
		for (var i = 0; i <= n; i++) { var uu = R.pu + (i / n - 0.5) * W, I = 0; if (ss > 1) { for (var s2 = 0; s2 < 3; s2++) I += H.recordAt(pts, uu + (s2 - 1) * W / n / 3, R.pv, o); I /= 3; } else I = H.recordAt(pts, uu, R.pv, o); var yy = py0 + ph - Math.min(1, I / Imax) * ph; if (i) x.lineTo(i / n * w, yy); else x.moveTo(0, yy); }
		x.strokeStyle = rgb(R.lam); x.lineWidth = 1.5; x.stroke();
		text(x, "brightness along the middle line", w - 8, hi + 10, 11, "#8792a8", "right");
		$("hg-rp-hint").textContent = "Drag to move across the plate";
	}
	function rSpacing() {   // local fringe spacing (reference × each point) at the patch centre, smallest
		var best = Infinity, sR = Math.sin(R.th * DEG), lam = R.lam / 1000;
		R.pts.forEach(function (p) { var du = R.pu - p.u * 1000, dv = R.pv - p.v * 1000, r = Math.sqrt(du * du + dv * dv + p.z * p.z * 1e6), su = du / r, sv = dv / r, s = Math.hypot(sR - su, sv); best = Math.min(best, s > 1e-12 ? lam / s : Infinity); });
		return best;
	}
	var rpDrag = null;
	rp.addEventListener("pointerdown", function (e) { rpDrag = ptr(rp, e); rp.setPointerCapture(e.pointerId); });
	rp.addEventListener("pointermove", function (e) { if (!rpDrag) return; var pt = ptr(rp, e), W = Math.pow(10, R.z), k = W / rp.clientWidth; R.pu = Math.max(-10000, Math.min(10000, R.pu - (pt.x - rpDrag.x) * k)); R.pv = Math.max(-10000, Math.min(10000, R.pv + (pt.y - rpDrag.y) * k)); rpDrag = pt; mark("rp"); rCards(); });
	rp.addEventListener("pointerup", function () { rpDrag = null; save(); });
	rp.addEventListener("wheel", function (e) { if (!(e.ctrlKey || e.metaKey || document.fullscreenElement)) return; e.preventDefault(); R.z = Math.max(1, Math.min(4.3, R.z + (e.deltaY > 0 ? 0.08 : -0.08))); pZ(); mark("rp"); save(); }, { passive: false });
	function rCards() {
		var o = rOpt(), p = R.pts[R.sel] || R.pts[0], spc = rSpacing(), lam = R.lam / 1000, Lc = o.Lc, sel = R.sel + 1;
		var du = R.pu - p.u * 1000, dv = R.pv - p.v * 1000, r = Math.sqrt(du * du + dv * dv + p.z * p.z * 1e6), gam = H.coherence(r - o.refPath, Lc), K = o.ampR * o.ampR / (p.a * p.a), V = H.visibility(K, gam);
		var lpm = 1000 / spc;
		$("hg-r-cards").innerHTML =
			card("Finest fringes here", len(spc), fmt(lpm, 3) + " lines per mm. Formula: λ / |sin θ<sub>ref</sub> − sin θ<sub>obj</sub>|.") +
			card("Fringe contrast, point " + sel, fmt(V * 100, 3) + " %", "Reference : this point = " + fmt(K, 2) + " : 1 gives " + fmt(H.visibility(K) * 100, 3) + " %" + (gam < 0.999 ? "; coherence keeps " + fmt(gam * 100, 3) + " % of that" : "") + ".", V < 0.1 ? "hg-bad" : "") +
			card("Coherence length", isFinite(Lc) ? len(Lc) : "very long", "Path difference to point " + sel + ": " + len(Math.abs(r - o.refPath)) + ".") +
			card("Film needed", fmt(lpm, 2) + " lines/mm", lpm > 150 ? "Ordinary photo film resolves ~100 lines/mm: you need holographic film or plates (3,000+ lines/mm)." : "Coarse enough for ordinary film.") +
			card("Keep it still", len(lam / 8), "Nothing may move more than about λ/8 during the exposure, or the fringes smear out.");
	}

	/* ================================================================ 2. PLAYBACK (numerical) */
	var V = S.v, DX = 0.8, LAM = 0.6328, vi = $("hg-vi"), vh = $("hg-vh"), vs = $("hg-vs");
	var VPRE = [["pts3", "Three points, three depths"], ["cube", "A cube of points"], ["mes", "Flat letters “MES”"], ["rec", "Your points from Recording"]];
	function vObjects() {
		var N = V.N, W = N * DX, pts = null, flat = null, z0 = 2000;
		if (V.pre === "pts3") pts = [{ u: -0.2 * W, v: -0.1 * W, z: 1200 }, { u: 0, v: 0.08 * W, z: 2000 }, { u: 0.22 * W, v: -0.03 * W, z: 2800 }];
		else if (V.pre === "cube") { pts = []; [-1, 1].forEach(function (a) { [-1, 1].forEach(function (b) { [-1, 1].forEach(function (c) { pts.push({ u: (0.15 * a + 0.05 * c) * W, v: (0.14 * b + 0.04 * c) * W, z: 2000 + 500 * c }); }); }); }); }
		else if (V.pre === "rec") pts = R.pts.map(function (p) { return { u: p.u / 10 * 0.3 * W, v: p.v / 10 * 0.3 * W, z: 800 + (p.z - 5) / 80 * 2400, a: p.a }; });
		else {
			var c = document.createElement("canvas"); c.width = c.height = N; var x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, N, N); x.fillStyle = "#fff";
			x.font = "bold " + Math.round(N * 0.2) + "px system-ui,Arial,sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("MES", N / 2, N / 2);
			var d = x.getImageData(0, 0, N, N).data, re = new Float64Array(N * N), im = new Float64Array(N * N), rnd = H.rng(11);
			for (var i = 0; i < N * N; i++) { var a = d[i * 4] / 255; if (V.diff) { var ph = rnd() * TAU; re[i] = a * Math.cos(ph); im[i] = a * Math.sin(ph); } else { re[i] = a; rnd(); } }
			flat = { re: re, im: im, z: z0 };
		}
		if (pts) { var rnd2 = H.rng(5); pts.forEach(function (p) { if (p.a == null) p.a = 1; p.ph = V.diff ? rnd2() * TAU : 0; }); }
		return { pts: pts, flat: flat };
	}
	function vOpt() { return { N: V.N, dx: DX, lam: LAM, thetaR: V.th, ratio: Math.pow(10, V.k) }; }
	var vCache = { rk: "", ik: "", rec: null, spec: null, S: null, obj: null, img: null, fk: "", ms: 0 };
	function vDepths() { var o = vCache.obj; if (!o) return []; if (o.flat) return [o.flat.z]; var zs = []; o.pts.forEach(function (p) { if (zs.every(function (z) { return Math.abs(z - p.z) > 5; })) zs.push(p.z); }); return zs.sort(function (a, b) { return a - b; }); }
	function vCompute() {
		var t0 = performance.now(), opt = vOpt(), rk = [V.pre, V.th, V.k, V.N, V.diff, V.pre === "rec" ? JSON.stringify(R.pts) : ""].join("|");
		if (rk !== vCache.rk) {
			vCache.obj = vObjects(); vCache.rec = H.makeHologram(opt, vCache.obj.pts, vCache.obj.flat);
			var re = H.soften(vCache.rec.H, V.N, 0.1), im = new Float64Array(re.length); H.fft2(re, im, V.N, false);
			var sp = new Float64Array(re.length); for (var i = 0; i < re.length; i++) sp[i] = Math.log(1 + Math.sqrt(re[i] * re[i] + im[i] * im[i]));
			vCache.spec = sp; vCache.rk = rk; vCache.ik = "";
		}
		var W = V.N * DX, pr = V.er * W / 2, pupil = V.cam ? { u: V.eu * (W / 2 - pr), v: -V.ev * (W / 2 - pr), r: pr } : null, inl = V.th < 0.01;
		var keep = inl ? { 0: true, 1: true, "-1": true } : { 0: V.k0, 1: V.k1, "-1": V.k2 };
		var ik = rk + "|" + V.light + "|" + JSON.stringify(keep) + "|" + JSON.stringify(pupil);
		if (ik !== vCache.ik) { vCache.S = H.illuminate(opt, vCache.rec.H, keep, Number(V.light), pupil); vCache.ik = ik; vCache.fk = ""; }
		var fk = ik + "|" + V.f;
		if (fk !== vCache.fk) { vCache.img = H.imageAt(opt, vCache.S, V.f); vCache.fk = fk; }
		vCache.ms = performance.now() - t0; vCache.pupil = pupil; vCache.keep = keep;
	}
	var viOff = document.createElement("canvas");
	function grey(cnv, arr, N, map) { if (cnv.width !== N) { cnv.width = N; cnv.height = N; } var x = cnv.getContext("2d"), img = x.createImageData(N, N), d = img.data; for (var i = 0; i < N * N; i++) { var c = map(arr[i]); d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; } x.putImageData(img, 0, 0); }
	function vDraw() {
		vCompute();
		var N = V.N, W = N * DX, I = vCache.img, mx = 0, i;
		for (i = 0; i < I.length; i++) if (I[i] > mx) mx = I[i];
		var g = V.g, red = H.waveRGB(633);
		grey(viOff, I, N, function (v) { var t = Math.pow(v / (mx || 1), g); return [red[0] * t, red[1] * t * 0.9 + 30 * t * t, red[2] * t + 30 * t * t]; });
		var f = fitCanvas(vi, 0.62, 240, maxH()), x = f.x, w = f.w, h = f.h, side = Math.min(w, h), ox = (w - side) / 2;
		x.fillStyle = "#070a12"; x.fillRect(0, 0, w, h); x.imageSmoothingEnabled = true; x.drawImage(viOff, ox, 0, side, side);
		var k = side / W;
		function sx(u) { return ox + (u + W / 2) * k; } function sy(v) { return (W / 2 - v) * k; }
		if (V.mk && vCache.obj && vCache.obj.pts) vCache.obj.pts.forEach(function (p, j) {
			var want = Number(V.light) > 0 ? -p.z : p.z, near = Math.abs(want - V.f) < 160;
			x.beginPath(); x.arc(sx(p.u), sy(-p.v), near ? 9 : 5, 0, TAU); x.setLineDash(near ? [] : [3, 3]); x.strokeStyle = near ? "#7ee081" : "rgba(160,170,190,0.55)"; x.lineWidth = 1.5; x.stroke(); x.setLineDash([]);
		});
		var nice = W / 4 >= 50 ? 50 : 20; line(x, ox + 10, h - 14, ox + 10 + nice * k, h - 14, "#fff", 3); text(x, nice + " µm", ox + 10 + nice * k / 2, h - 26, 11, "#fff", "center");
		var where = V.f < 0 ? len(-V.f) + " behind the plate" : V.f > 0 ? len(V.f) + " in front of the plate" : "on the plate";
		text(x, "Focus: " + where, 10, 14, 12, "#e6ebf5");
		text(x, (Number(V.light) > 0 ? "Lit by the reference beam" : "Lit by the reversed beam") + (V.cam ? " · small camera opening" : ""), 10, 32, 12, "#aeb8cc");
		$("hg-v-hint").textContent = "";
		// hologram
		var Hh = vCache.rec.H, hmx = 0, hmn = Infinity; for (i = 0; i < Hh.length; i++) { if (Hh[i] > hmx) hmx = Hh[i]; if (Hh[i] < hmn) hmn = Hh[i]; }
		var hoff = document.createElement("canvas"); grey(hoff, Hh, N, function (v) { var t = (v - hmn) / ((hmx - hmn) || 1); return [255 * t, 235 * t, 220 * t]; });
		var fh = fitCanvas(vh, 1, 140, 420), xh = fh.x; xh.imageSmoothingEnabled = false; xh.drawImage(hoff, 0, 0, fh.w, fh.h); xh.imageSmoothingEnabled = true;
		if (vCache.pupil) { var p = vCache.pupil, kk = fh.w / W; xh.beginPath(); xh.arc((p.u + W / 2) * kk, (W / 2 - p.v) * kk, p.r * kk, 0, TAU); xh.strokeStyle = "#7ee081"; xh.lineWidth = 2; xh.stroke(); text(xh, "camera", (p.u + W / 2) * kk, (W / 2 - p.v) * kk, 11, "#7ee081", "center"); }
		text(xh, len(W) + " wide", 6, fh.h - 10, 11, "#fff");
		// spectrum (shifted)
		var spc = vCache.spec, smx = 0, smn = Infinity; for (i = 1; i < spc.length; i++) { if (spc[i] > smx) smx = spc[i]; if (spc[i] < smn) smn = spc[i]; }
		var sh = new Float64Array(N * N); for (var y = 0; y < N; y++) for (var xx = 0; xx < N; xx++) sh[y * N + xx] = spc[((y + N / 2) % N) * N + (xx + N / 2) % N];
		var soff = document.createElement("canvas"); grey(soff, sh, N, function (v) { var t = Math.max(0, Math.min(1, (v - smn) / ((smx - smn) || 1))); t = Math.pow(t, 1.6); return [120 * t, 210 * t, 255 * t]; });
		var fs = fitCanvas(vs, 1, 140, 420), xs = fs.x; xs.drawImage(soff, 0, 0, fs.w, fs.h);
		var fR = H.lobeCentre(LAM, V.th), fN = 1 / (2 * DX), sc = fs.w / 2 / fN, cxs = fs.w / 2, cys = fs.h / 2, kp = vCache.keep;
		// shade blocked parts
		if (V.th >= 0.01) {
			[[0, 0], [1, -fR], [-1, fR]].forEach(function (l) {
				if (kp[l[0]]) return; var lo = l[0] === 0 ? -fR / 2 : l[0] === 1 ? -fN : fR / 2, hiF = l[0] === 0 ? fR / 2 : l[0] === 1 ? -fR / 2 : fN;
				xs.fillStyle = "rgba(7,10,18,0.72)"; xs.fillRect(cxs + lo * sc, 0, (hiF - lo) * sc, fs.h);
			});
			[[0, 14, "zero order"], [-fR, 30, "virtual"], [fR, 30, "twin"]].forEach(function (l) { text(xs, l[2], cxs + l[0] * sc, l[1], 11, "#ffd166", "center"); line(xs, cxs + l[0] * sc, l[1] + 8, cxs + l[0] * sc, l[1] + 18, "#ffd166", 1); });
		} else text(xs, "in-line: all three overlap", fs.w / 2, 14, 11, "#ffcf70", "center");
		vCards();
	}
	vs.addEventListener("click", function (e) {
		if (V.th < 0.01) return; var pt = ptr(vs, e), fN = 1 / (2 * DX), f = (pt.x - vs.clientWidth / 2) / (vs.clientWidth / 2) * fN, fv = (vs.clientHeight / 2 - pt.y) / (vs.clientHeight / 2) * fN, l = H.lobeOf(f, fv, H.lobeCentre(LAM, V.th));
		if (l === 0) V.k0 = !V.k0; else if (l === 1) V.k1 = !V.k1; else V.k2 = !V.k2; syncView(); save(); mark("view");
	});
	function vCards() {
		var W = V.N * DX, zs = vDepths(), z = zs.length ? zs[Math.floor(zs.length / 2)] : 2000, fR = H.lobeCentre(LAM, V.th), maxA = H.maxAngle(LAM, DX), D = V.cam ? 2 * V.er * W / 2 : W;
		var inl = V.th < 0.01, aliasing = Math.sin(V.th * DEG) * 2 + (W / 2 + 0.25 * W) / z > LAM / (2 * DX) * 1.0;
		$("hg-v-cards").innerHTML =
			card("Plate", len(W) + " square", V.N + " × " + V.N + " samples, " + len(DX) + " apart. Steepest light it can carry: " + fmt(maxA, 3) + "° from the normal.") +
			card("Sharpest detail", len(H.resolution(LAM, z, D)), "About λz / D at " + len(z) + (V.cam ? " through the camera opening" : "") + ". A bigger plate or a bigger opening is sharper.") +
			card("Fringe spacing (reference × straight-ahead light)", inl ? "none (in-line)" : len(LAM / Math.sin(V.th * DEG)), inl ? "In-line: the reference and the object light travel the same way, so the three waves overlap." : "The three waves leave at about 0°, " + fmt(V.th, 3) + "° and " + fmt(2 * V.th, 3) + "° (twin) apart.", inl ? "hg-bad" : "") +
			card("Computing time", fmt(vCache.ms, 3) + " ms", "Hologram, filter, light and propagation: several 2D FFTs." + (aliasing && !inl && (Number(V.light) > 0 ? V.k2 : V.k1) ? " Note: the twin leaves at an angle this grid cannot carry, so it wraps round the edges." : ""));
	}
	var pVf = bindRange("hg-v-f", function () { return V.f; }, function (v) { V.f = v; }, function (v) { return v < 0 ? len(-v) + " behind the plate" : v > 0 ? len(v) + " in front of the plate" : "on the plate"; }, function () { mark("view"); });
	var pVth = bindRange("hg-v-th", function () { return V.th; }, function (v) { V.th = v; }, function (v) { return v < 0.01 ? "0° (in-line, Gabor)" : fmt(v, 3) + "°"; }, function () { kNote(); mark("view"); });
	var pVk = bindRange("hg-v-k", function () { return V.k; }, function (v) { V.k = v; }, function (v) { return fmt(Math.pow(10, v), 2) + " : 1"; }, function () { mark("view"); });
	var pVeu = bindRange("hg-v-eu", function () { return V.eu; }, function (v) { V.eu = v; }, function (v) { return Math.round(v * 100) + " %"; }, function () { if (!V.cam) { V.cam = true; pCam(); } mark("view"); });
	var pVev = bindRange("hg-v-ev", function () { return V.ev; }, function (v) { V.ev = v; }, function (v) { return Math.round(v * 100) + " %"; }, function () { if (!V.cam) { V.cam = true; pCam(); } mark("view"); });
	var pVer = bindRange("hg-v-er", function () { return V.er; }, function (v) { V.er = v; }, function (v) { return Math.round(v * 100) + " % of the plate"; }, function () { if (!V.cam) { V.cam = true; pCam(); } mark("view"); });
	var pVg = bindRange("hg-v-g", function () { return V.g; }, function (v) { V.g = v; }, function (v) { return Math.round((1 - v) * 125) + " %"; }, function () { mark("view"); });
	var pCam = checkInit("hg-v-cam", function () { return V.cam; }, function (b) { V.cam = b; }, function () { mark("view"); });
	var pDiff = checkInit("hg-v-diff", function () { return V.diff; }, function (b) { V.diff = b; }, function () { mark("view"); });
	var pMk = checkInit("hg-v-mk", function () { return V.mk; }, function (b) { V.mk = b; }, function () { mark("view"); });
	var pK0 = checkInit("hg-v-k0", function () { return V.k0; }, function (b) { V.k0 = b; }, function () { mark("view"); });
	var pK1 = checkInit("hg-v-k1", function () { return V.k1; }, function (b) { V.k1 = b; }, function () { mark("view"); });
	var pK2 = checkInit("hg-v-k2", function () { return V.k2; }, function (b) { V.k2 = b; }, function () { mark("view"); });
	var pLight = segInit("hg-v-light", function () { return V.light; }, function (v) {
		var was = Number(V.light); V.light = Number(v); if (was !== V.light) { V.f = -V.f; var t = V.k1; V.k1 = V.k2; V.k2 = t; syncView(); }
	}, function () { mark("view"); });
	var pN = segInit("hg-v-n", function () { return V.N; }, function (v) { V.N = Number(v); }, function () { mark("view"); });
	var pVpre = chips("hg-v-pre", VPRE, function () { return V.pre; }, function (v) { V.pre = v; vCache.rk = ""; vCompute(); var zs = vDepths(); V.f = (Number(V.light) > 0 ? -1 : 1) * zs[0]; syncView(); mark("view"); });
	function fChips() {
		var zs = vDepths(), el = $("hg-v-fch"), sg = Number(V.light) > 0 ? -1 : 1;
		el.innerHTML = "<span class='tu-note'>Focus on:</span> " + zs.map(function (z, i) { return "<button type='button' data-fz='" + (sg * z) + "'>" + (vCache.obj && vCache.obj.flat ? "the letters" : "depth " + (i + 1)) + " (" + len(z) + ")</button>"; }).join("");
	}
	$("hg-v-fch").addEventListener("click", function (e) { var b = e.target.closest("[data-fz]"); if (!b) return; V.f = Number(b.getAttribute("data-fz")); pVf(); save(); mark("view"); });
	function kNote() { var inl = V.th < 0.01; ["hg-v-k0", "hg-v-k1", "hg-v-k2"].forEach(function (id) { $(id).disabled = inl; }); $("hg-v-knote").textContent = inl ? "In-line hologram: the three parts share the same directions, so no filter can pull them apart (the twin-image problem)." : "Real off-axis holograms are seen without any filter: the parts leave in different directions and your eye only catches one."; }
	function syncView() { pVf(); pVth(); pVk(); pVeu(); pVev(); pVer(); pVg(); pCam(); pDiff(); pMk(); pK0(); pK1(); pK2(); pLight(); pN(); pVpre(); kNote(); }
	// keyboard on the image: arrows move the camera, PageUp/PageDown focus
	vi.addEventListener("keydown", function (e) { var used = true; if (e.key === "ArrowLeft") V.eu = Math.max(-1, V.eu - 0.05); else if (e.key === "ArrowRight") V.eu = Math.min(1, V.eu + 0.05); else if (e.key === "ArrowUp") V.ev = Math.min(1, V.ev + 0.05); else if (e.key === "ArrowDown") V.ev = Math.max(-1, V.ev - 0.05); else if (e.key === "PageUp") V.f = Math.min(4000, V.f + 100); else if (e.key === "PageDown") V.f = Math.max(-4000, V.f - 100); else used = false; if (used) { e.preventDefault(); if (/Arrow/.test(e.key)) V.cam = true; syncView(); save(); mark("view"); } });
	var viDrag = null;   // drag on the image = move the camera opening (parallax)
	vi.addEventListener("pointerdown", function (e) { viDrag = ptr(vi, e); vi.setPointerCapture(e.pointerId); });
	vi.addEventListener("pointermove", function (e) { if (!viDrag) return; var pt = ptr(vi, e), s = Math.min(vi.clientWidth, vi.clientHeight); V.cam = true; V.eu = Math.max(-1, Math.min(1, V.eu + (pt.x - viDrag.x) / s * 2)); V.ev = Math.max(-1, Math.min(1, V.ev - (pt.y - viDrag.y) / s * 2)); viDrag = pt; syncView(); mark("view"); });
	vi.addEventListener("pointerup", function () { viDrag = null; save(); });

	/* ================================================================ 3. COHERENCE */
	var C = S.c, cc = $("hg-c"), cSel = $("hg-c-src");
	cSel.innerHTML = H.SOURCES.map(function (s) { return "<option value='" + s.id + "'>" + esc(s.name) + "</option>"; }).join("");
	function cLam() { return source(C.src).lam; }
	function cLc() { return C.w <= -8.99 ? Infinity : H.coherenceLength(cLam(), Math.pow(10, C.w)); }
	cSel.value = C.src; cSel.addEventListener("change", function () { C.src = cSel.value; var s = source(C.src); C.w = s.dlam > 0 ? Math.log10(s.dlam) : -9; pCw(); save(); mark("coh"); });
	var pCw = bindRange("hg-c-w", function () { return C.w; }, function (v) { C.w = v; }, function (v) { return v <= -8.99 ? "0 (ideal)" : len(Math.pow(10, v), 2) + " → Lc = " + len(H.coherenceLength(cLam(), Math.pow(10, v)), 2); }, function () { mark("coh"); });
	var pCx = bindRange("hg-c-x", function () { return C.x; }, function (v) { C.x = v; }, function (v) { var L = cLc(); return fmt(v, 3) + " Lc" + (isFinite(L) ? " = " + len(v * L, 3) : ""); }, function () { mark("coh"); });
	var pCm = bindRange("hg-c-m", function () { return C.m; }, function (v) { C.m = v; }, function (v) { return v + " nm"; }, function () { mark("coh"); });
	var cT = 0, cJumps = (function () { var r = H.rng(9), a = []; for (var i = 0; i < 400; i++) a.push(r() * TAU); return a; })();
	function cDraw() {
		var f = fitCanvas(cc, 0.62, 300, maxH()), x = f.x, w = f.w, h = f.h, lam = cLam() * 1000, col = rgb(lam), gam = H.coherence(C.x, 1), mot = H.motionContrast(C.m / 1000, cLam()), tot = gam * mot;
		x.fillStyle = "#070a12"; x.fillRect(0, 0, w, h);
		// A: two wave trains (each a chain of segments one coherence length long with a random phase)
		var Ld = Math.max(120, w * 0.28), wl = 18, top = 26, amp = 12, shift = C.x * Ld, off = (cT * 40) % (Ld * 40);
		function train(y, delay, c) { x.beginPath(); for (var px = 0; px <= w; px += 2) { var s = px + off - delay, seg = Math.floor((s + 1e6 * Ld) / Ld) % cJumps.length, yy = y + amp * Math.sin(TAU * s / wl + cJumps[seg]); if (px) x.lineTo(px, yy); else x.moveTo(px, yy); } x.strokeStyle = c; x.lineWidth = 1.6; x.stroke(); }
		text(x, "Reference beam", 8, top, 11, "#aeb8cc"); train(top + 22, 0, col);
		text(x, "Object beam (" + fmt(C.x, 3) + " coherence lengths later)", 8, top + 50, 11, "#aeb8cc"); train(top + 72, shift, rgb(lam, 0.75));
		for (var px = 0; px < w; px += 3) { var a = Math.floor((px + off + 1e6 * Ld) / Ld), b = Math.floor((px + off - shift + 1e6 * Ld) / Ld); x.fillStyle = a === b ? "rgba(126,224,129,0.8)" : "rgba(255,111,111,0.55)"; x.fillRect(px, top + 92, 3, 5); }
		text(x, "green = same wave train, in step; red = unrelated, no steady fringes (drawn simply)", 8, top + 108, 10, "#8792a8");
		// B: the fringes on the plate
		var fy = top + 122, fh = Math.max(36, h * 0.16), per = 14;
		for (px = 0; px < w; px++) { var I = 0.5 * (1 + tot * Math.cos(TAU * px / per)), c = H.waveRGB(lam); x.fillStyle = "rgb(" + Math.round(c[0] * I) + "," + Math.round(c[1] * I) + "," + Math.round(c[2] * I) + ")"; x.fillRect(px, fy, 1, fh); }
		text(x, "Fringes on the plate: contrast " + fmt(tot * 100, 3) + " %", 8, fy + fh + 12, 11, "#e6ebf5");
		// C: contrast against the path difference
		var gy = fy + fh + 28, gh = h - gy - 26, gx = 46, gw = w - 60;
		line(x, gx, gy + gh, gx + gw, gy + gh, "#55607a", 1); line(x, gx, gy, gx, gy + gh, "#55607a", 1);
		text(x, "100 %", gx - 4, gy, 10, "#8792a8", "right"); text(x, "0", gx - 4, gy + gh, 10, "#8792a8", "right");
		for (var t = 0; t <= 2.5; t += 0.5) text(x, fmt(t, 2) + " Lc", gx + t / 2.5 * gw, gy + gh + 12, 10, "#8792a8", "center");
		x.beginPath(); for (var i = 0; i <= 200; i++) { var xx = i / 200 * 2.5, yy = gy + gh - H.coherence(xx, 1) * mot * gh; if (i) x.lineTo(gx + xx / 2.5 * gw, yy); else x.moveTo(gx, yy); } x.strokeStyle = col; x.lineWidth = 2; x.stroke();
		var mx = gx + C.x / 2.5 * gw, my = gy + gh - tot * gh; line(x, mx, gy, mx, gy + gh, "rgba(255,255,255,0.35)", 1, [4, 4]); x.beginPath(); x.arc(mx, my, 7, 0, TAU); x.fillStyle = "#fff"; x.fill();
		text(x, "fringe contrast against path difference", gx + gw, gy - 8, 11, "#aeb8cc", "right");
		cc.__g = { gx: gx, gw: gw, gy: gy, gh: gh };
		cCards(gam, mot);
	}
	function cDragTo(e) { var g = cc.__g, pt = ptr(cc, e); if (!g || pt.y < g.gy - 20) return false; C.x = Math.max(0, Math.min(2.5, (pt.x - g.gx) / g.gw * 2.5)); pCx(); mark("coh"); return true; }
	var cDrag = false; cc.addEventListener("pointerdown", function (e) { if (cDragTo(e)) { cDrag = true; cc.setPointerCapture(e.pointerId); } }); cc.addEventListener("pointermove", function (e) { if (cDrag) cDragTo(e); }); cc.addEventListener("pointerup", function () { cDrag = false; save(); });
	cc.addEventListener("keydown", function (e) { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); C.x = Math.max(0, Math.min(2.5, C.x + (e.key === "ArrowRight" ? 0.05 : -0.05))); pCx(); mark("coh"); save(); } });
	function cCards(gam, mot) {
		var L = cLc(), lam = cLam();
		$("hg-c-cards").innerHTML =
			card("Coherence length", isFinite(L) ? len(L) : "very long", "Lc = λ² / Δλ for " + Math.round(lam * 1000) + " nm.") +
			card("Path difference", isFinite(L) ? len(C.x * L) : "–", "Between the reference and the object light.") +
			card("Fringe contrast", fmt(gam * mot * 100, 3) + " %", "Coherence " + fmt(gam * 100, 3) + " %" + (C.m ? " × motion " + fmt(mot * 100, 3) + " %" : "") + ".", gam * mot < 0.2 ? "hg-bad" : "hg-ok") +
			card("Deepest scene", isFinite(L) ? "≈ " + len(L / 2) : "no limit", "Light to the back of the object goes farther; keep every path within about Lc/2 of the reference.") +
			card("Allowed movement", len(lam / 8), "Moving λ/8 keeps about 90 % contrast; moving λ/2 wipes it out.");
	}
	$("hg-c-tab").innerHTML = "<thead><tr><th>Source</th><th>Wavelength</th><th>Spectral width</th><th>Coherence length</th><th>Deepest scene</th></tr></thead><tbody>" + H.SOURCES.map(function (s) { var L = H.coherenceLength(s.lam, s.dlam); return "<tr><td>" + esc(s.name) + "</td><td>" + sw(s.lam * 1000) + Math.round(s.lam * 1000) + " nm</td><td>" + (s.dlam ? len(s.dlam, 2) : "0") + "</td><td>" + (isFinite(L) ? len(L, 2) : "endless") + "</td><td>" + (isFinite(L) ? len(L / 2, 2) : "any") + "</td></tr>"; }).join("") + "</tbody>";

	/* ================================================================ 4. TYPES */
	var T = S.t, tc = $("hg-t"), tt = 0;
	function eye(x, ex, ey, dir, col) { x.save(); x.translate(ex, ey); x.scale(dir, 1); x.beginPath(); x.moveTo(-14, 0); x.quadraticCurveTo(0, -11, 14, 0); x.quadraticCurveTo(0, 11, -14, 0); x.strokeStyle = col || "#e6ebf5"; x.lineWidth = 1.6; x.stroke(); x.beginPath(); x.arc(-4, 0, 4, 0, TAU); x.fillStyle = col || "#e6ebf5"; x.fill(); x.restore(); }
	function plate(x, px, cy, hh, label) { x.fillStyle = "#9fb3c8"; x.fillRect(px - 3, cy - hh / 2, 6, hh); if (label) text(x, label, px, cy - hh / 2 - 10, 11, "#cfd6e6", "center"); }
	function lamp(x, lx, ly) { var g = x.createRadialGradient(lx, ly, 2, lx, ly, 18); g.addColorStop(0, "#fff"); g.addColorStop(1, "rgba(255,240,200,0)"); x.fillStyle = g; x.beginPath(); x.arc(lx, ly, 18, 0, TAU); x.fill(); }
	function objIcon(x, ox, oy, s, col) { x.fillStyle = col || "#c9a86a"; x.beginPath(); x.arc(ox, oy - s * 0.55, s * 0.32, 0, TAU); x.fill(); x.fillRect(ox - s * 0.18, oy - s * 0.3, s * 0.36, s * 0.55); x.fillRect(ox - s * 0.4, oy + s * 0.25, s * 0.8, s * 0.18); }
	var TYPES = [
		{ id: "trans", name: "Transmission (off-axis)", hint: "",
			text: "<p>The classic laser hologram of Leith and Upatnieks (1962). The reference beam comes in at an angle from the <b>same side</b> as the object light, so the fringes on the plate are slanted lines a micrometre or two apart (λ / sin θ). To see it, light the plate from behind with the same laser at the same angle and look through it: the object floats behind the plate in full 3D. In white light each colour bends by a different angle, so the image smears into a rainbow streak.</p>",
			ctl: [["mode", "Show", "seg", [["rec", "Recording"], ["laser", "Viewing with the laser"], ["white", "Viewing with white light"]], "rec"], ["th", "Reference angle", 10, 60, 1, 30, function (v) { return v + "°"; }], ["lam", "Laser wavelength", 450, 650, 1, 633, function (v) { return v + " nm"; }]],
			draw: function (x, w, h, p) {
				var px = w * 0.6, cy = h * 0.52, th = p.th * DEG, col = rgb(p.lam);
				plate(x, px, cy, h * 0.55, "plate");
				if (p.mode === "rec") {
					objIcon(x, w * 0.2, cy + 10, 46);
					for (var i = -3; i <= 3; i++) line(x, w * 0.2 + 12, cy - 6, px - 4, cy + i * h * 0.07, rgb(p.lam, 0.5), 1.2);
					for (i = -3; i <= 3; i++) { var yy = cy + i * h * 0.07; arrow(x, px - 4 - Math.cos(th) * w * 0.4, yy + Math.sin(th) * w * 0.4, px - 6, yy, col, 1.6); }
					text(x, "object light", w * 0.22, cy + 52, 12, "#e6ebf5", "center"); text(x, "reference beam " + p.th + "°", px - Math.cos(th) * w * 0.25, cy + Math.sin(th) * w * 0.25 + 26, 12, col, "center");
					for (i = 0; i < 26; i++) { var fy = cy - h * 0.27 + i * h * 0.55 / 26; line(x, px + 8, fy, px + 20, fy + 3, rgb(p.lam, 0.7), 1); }
					text(x, "fringes", px + 14, cy + h * 0.31, 11, "#cfd6e6", "center");
				} else {
					var white = p.mode === "white";
					for (i = -3; i <= 3; i++) { yy = cy + i * h * 0.07; arrow(x, px - 4 - Math.cos(th) * w * 0.35, yy + Math.sin(th) * w * 0.35, px - 6, yy, white ? "#fff" : col, 1.6); }
					text(x, white ? "white lamp" : "the laser again", px - Math.cos(th) * w * 0.3, cy + Math.sin(th) * w * 0.3 + 24, 12, white ? "#fff" : col, "center");
					var Lam = p.lam / Math.sin(th), lams = white ? [440, 490, 540, 590, 650] : [p.lam];
					lams.forEach(function (l) { var o = H.gratingOut(l, Lam, p.th, 1), a = (o == null ? 0 : o) * DEG; arrow(x, px + 4, cy, px + 4 + Math.cos(a) * w * 0.3, cy - Math.sin(a) * w * 0.3, rgb(l), 2); var ix = w * 0.2, iy = cy + Math.tan(a) * (px - ix); x.beginPath(); x.arc(ix, iy, white ? 6 : 10, 0, TAU); x.fillStyle = rgb(l, white ? 0.8 : 0.9); x.fill(); line(x, ix, iy, px, cy, rgb(l, 0.35), 1, [4, 4]); });
					arrow(x, px + 4, cy, px + 4 + Math.cos(th) * w * 0.25, cy - Math.sin(th) * w * 0.25, rgb(white ? 560 : p.lam, 0.5), 1.5); text(x, "zero order", px + Math.cos(th) * w * 0.25, cy - Math.sin(th) * w * 0.25 - 12, 11, "#aeb8cc", "center");
					eye(x, w * 0.93, cy, -1); text(x, white ? "the image smears into a spectrum" : "virtual image, behind the plate", w * 0.2, cy - 60, 12, "#e6ebf5", "center");
				}
			},
			cards: function (p) { var d = p.lam / 1000 / Math.sin(p.th * DEG), a1 = H.gratingOut(0.44, d, p.th, 1), a2 = H.gratingOut(0.65, d, p.th, 1); return card("Fringe spacing", len(d), fmt(1000 / d, 3) + " lines per mm") + card("Colour smear in white light", a1 != null && a2 != null ? fmt(Math.abs(a1 - a2), 3) + "°" : "–", "Angle between blue (440 nm) and red (650 nm) leaving the plate.") + card("Parallax", "full", "Left-right and up-down: the plate is a window onto the scene."); } },
		{ id: "gabor", name: "In-line (Gabor)", hint: "",
			text: "<p>Dennis Gabor's original idea (1948, Nobel Prize 1971), made to improve electron microscopes. One beam shines through a mostly see-through object, such as small particles: the light that misses them is the reference. On playback the virtual image and its twin (real image) lie on the same axis, so you always see one through the out-of-focus blur of the other. Lasers did not exist yet; the trick only worked well once Leith and Upatnieks tilted the reference. In-line holography is still used for particles, droplets and plankton, and with electrons and X-rays.</p><p><button type='button' class='tu-btn tu-btn--ghost' data-goto='view' data-th='0'>Try the twin-image problem in Playback →</button></p>",
			ctl: [["mode", "Show", "seg", [["rec", "Recording"], ["view", "Viewing"]], "rec"]],
			draw: function (x, w, h, p, t) {
				var px = w * 0.62, cy = h * 0.5, col = rgb(633);
				plate(x, px, cy, h * 0.6, "plate");
				for (var i = -4; i <= 4; i++) arrow(x, w * 0.04, cy + i * h * 0.06, px - 6, cy + i * h * 0.06, rgb(633, 0.6), 1.3);
				if (p.mode === "rec") {
					[[0.3, -0.05], [0.33, 0.1], [0.27, 0.16]].forEach(function (q) { var ox = w * q[0], oy = cy + h * q[1]; x.beginPath(); x.arc(ox, oy, 4, 0, TAU); x.fillStyle = "#c9a86a"; x.fill(); x.strokeStyle = rgb(633, 0.4); for (var r = 10 + (t * 30) % 20; r < px - ox; r += 20) { x.beginPath(); x.arc(ox, oy, r, -0.6, 0.6); x.stroke(); } });
					text(x, "one beam: the light that misses the particles is the reference", w * 0.32, h - 18, 12, "#e6ebf5", "center");
				} else {
					var d = px - w * 0.3; [[-0.05], [0.1], [0.16]].forEach(function (q) { var oy = cy + h * q[0]; x.beginPath(); x.arc(px - d, oy, 5, 0, TAU); x.fillStyle = "#7ee081"; x.fill(); x.beginPath(); x.arc(Math.min(w - 50, px + d), cy - (oy - cy), 5, 0, TAU); x.fillStyle = "#ff6fb5"; x.fill(); });
					text(x, "virtual images", px - d, cy - h * 0.25, 12, "#7ee081", "center"); text(x, "twin (real) images, same axis", Math.min(w - 90, px + d), cy - h * 0.25, 12, "#ff6fb5", "center");
					eye(x, w - 24, cy, -1);
				}
				void col;
			},
			cards: function () { return card("Reference angle", "0°", "Everything travels the same way.") + card("Twin image", "in the way", "Always overlaps the image you want.", "hg-bad") + card("Used for", "particles, electrons, X-rays", "Where no tilted reference is practical."); } },
		{ id: "refl", name: "Reflection (Denisyuk)", hint: "",
			text: "<p>Yuri Denisyuk (1962): the reference and object light enter the emulsion from <b>opposite sides</b>, so they form a standing wave and the fringes become layers <b>parallel to the surface</b>, half a wavelength (in the emulsion) apart. Lit from the front by an ordinary lamp, the stack reflects only the colour whose wavelength fits the layer spacing (Bragg's law, as in a butterfly wing or a Lippmann colour photograph). The curve is Kogelnik's coupled-wave result for this layered grating. Processing often shrinks the emulsion, which moves the colour toward blue.</p>",
			ctl: [["lam", "Recording laser", 440, 660, 1, 633, function (v) { return v + " nm"; }], ["T", "Emulsion thickness", 3, 40, 0.5, 12, function (v) { return v + " µm"; }], ["dn", "Index modulation Δn", 0.003, 0.06, 0.001, 0.025, function (v) { return fmt(v, 2); }], ["sh", "Shrinkage after processing", -5, 15, 0.5, 0, function (v) { return v + " %"; }], ["va", "Viewing tilt (in air)", 0, 60, 1, 0, function (v) { return v + "°"; }]],
			calc: function (p) { var n = 1.52, L = H.reflectionSpacing(p.lam / 1000, n, 0) * (1 - p.sh / 100), ti = H.insideAngle(p.va, n), g = { Lambda: L, n: n, dn: p.dn, T: p.T, thetaIn: ti }, best = 0, bl = 0, spec = [], R = 0, G = 0, B = 0; for (var l = 380; l <= 780; l += 1) { var e = H.reflectionEff(l / 1000, g); spec.push(e); if (e > best) { best = e; bl = l; } var c = H.waveRGB(l); R += c[0] * e; G += c[1] * e; B += c[2] * e; } var m = Math.max(R, G, B) || 1; return { n: n, L: L, ti: ti, g: g, peak: H.braggLambda(L, n, ti) * 1000, best: best, bl: bl, spec: spec, col: [R / m * 255, G / m * 255, B / m * 255] }; },
			draw: function (x, w, h, p) {
				var c = this.calc(p), lx = 16, lw = Math.min(w * 0.36, 300), ly = 62, lh = h - 104;
				x.fillStyle = "#1a2234"; x.fillRect(lx, ly, lw, lh); var nl = Math.min(36, Math.round(p.T / c.L));
				for (var i = 0; i <= nl; i++) { var y = ly + i * lh / nl; line(x, lx, y, lx + lw, y, rgb(Math.max(380, Math.min(780, c.peak)), 0.75), 1.4); }
				text(x, "emulsion, side view: " + Math.round(p.T / c.L) + " layers" + (nl < Math.round(p.T / c.L) ? " (" + nl + " drawn)" : ""), lx, 14, 11, "#cfd6e6");
				text(x, "white light in", lx + lw * 0.12, 36, 11, "#fff", "left"); arrow(x, lx + lw * 0.2, 30, lx + lw * 0.3, ly - 2, "#fff", 2);
				arrow(x, lx + lw * 0.55, ly - 2, lx + lw * 0.65, 30, "rgb(" + c.col.map(Math.round).join(",") + ")", 3); text(x, "one colour back", lx + lw * 0.68, 36, 11, "rgb(" + c.col.map(Math.round).join(",") + ")", "center");
				// spectrum plot
				var gx = lx + lw + 50, gw = w - gx - 16, gy = 62, gh = h - 104;
				for (var l = 380; l <= 780; l += 2) { x.fillStyle = rgb(l, 0.22); x.fillRect(gx + (l - 380) / 400 * gw, gy + gh + 6, gw / 200 + 1, 10); }
				line(x, gx, gy + gh, gx + gw, gy + gh, "#55607a", 1); line(x, gx, gy, gx, gy + gh, "#55607a", 1);
				x.beginPath(); c.spec.forEach(function (e, i) { var X = gx + i / 400 * gw, Y = gy + gh - e * gh; if (i) x.lineTo(X, Y); else x.moveTo(X, Y); }); x.strokeStyle = "#fff"; x.lineWidth = 2; x.stroke();
				[400, 500, 600, 700].forEach(function (l) { text(x, l + " nm", gx + (l - 380) / 400 * gw, gy + gh + 28, 10, "#8792a8", "center"); });
				text(x, "100 %", gx - 4, gy, 10, "#8792a8", "right"); text(x, "reflected share of each colour", gx, gy - 14, 11, "#aeb8cc");
				x.fillStyle = "rgb(" + c.col.map(Math.round).join(",") + ")"; x.fillRect(gx + 8, gy + 8, 34, 34); text(x, "what you see", gx + 48, gy + 25, 11, "#e6ebf5");
			},
			cards: function (p) { var c = this.calc(p), Q = H.kleinCook(p.lam / 1000, p.T, c.n, c.L); return card("Layer spacing Λ", len(c.L, 3), "λ / (2n) in an emulsion of index " + c.n + (p.sh ? ", then shrunk " + p.sh + " %" : "") + ".") + card("Colour reflected", sw(c.peak) + Math.round(c.peak) + " nm", H.colourName(c.peak) + ". Bragg: λ = 2nΛ cos θ, θ = " + fmt(c.ti, 3) + "° inside.") + card("Peak reflection", fmt(c.best * 100, 3) + " %", "tanh² of the coupling strength ν = πΔnT/λ.") + card("Colour band", "≈ " + len(H.reflectionBand(c.peak / 1000, c.n, p.T), 3), "λ²/(2nT): a thicker emulsion is more selective.") + card("Thick or thin?", "Q = " + fmt(Q, 3), Q > 10 ? "A volume (Bragg) grating." : "Fairly thin: Bragg selection is weak."); } },
		{ id: "rainbow", name: "Rainbow (Benton)", hint: "Move the eye",
			text: "<p>Stephen Benton (1968) made a hologram of a hologram through a narrow horizontal slit. The slit throws away up-down parallax, but in return each colour of white light builds a sharp image at its own height: move your eye up and down and the whole picture changes colour, left-right you still see 3D. Most rainbow holograms are copied by embossing (next type).</p>",
			ctl: [["ea", "Eye height (viewing angle)", -15, 15, 0.25, 0, function (v) { return v + "°"; }], ["ia", "Lamp angle", 30, 60, 1, 45, function (v) { return v + "°"; }], ["sw", "Slit width", 0.5, 12, 0.5, 3, function (v) { return v + " mm"; }]],
			calc: function (p) { var Lam = 0.633 / Math.sin(p.ia * DEG), lam = H.gratingLambda(Lam, p.ia, p.ea) * 1000, dth = p.sw / 300, dl = Lam * Math.cos(p.ea * DEG) * dth * 1000; return { Lam: Lam, lam: lam, dl: dl }; },
			draw: function (x, w, h, p) {
				var c = this.calc(p), px = w * 0.28, cy = h * 0.5, hh = h * 0.6, D = w * 0.36, ld = Math.min(w * 0.22, (h / 2 - 34) / Math.tan(p.ia * DEG)), lx0 = px - ld, ly0 = cy + Math.tan(p.ia * DEG) * ld;
				plate(x, px, cy, hh, "hologram"); lamp(x, lx0, ly0); arrow(x, lx0 + (px - lx0) * 0.12, ly0 - (ly0 - cy) * 0.12, px - 6, cy, "#fff", 2); text(x, "white lamp", lx0 + 22, ly0 + 4, 11, "#fff", "left");
				for (var l = 400; l <= 700; l += 10) { var a = Math.asin(Math.max(-1, Math.min(1, Math.sin(p.ia * DEG) - l / 1000 / c.Lam))), yy = cy - Math.tan(a) * D; if (yy > 10 && yy < h - 10) { line(x, px + 4, cy, px + D, yy, rgb(l, 0.25), 1); x.fillStyle = rgb(l); x.fillRect(px + D - 3, yy - 3, 8, 8); } }
				var ey = cy - Math.tan(p.ea * DEG) * D; eye(x, px + D + 24, ey, -1);
				text(x, "slit image: each colour at its own height", px + D, h - 14, 11, "#cfd6e6", "center");
				var bw = Math.max(90, Math.min(w * 0.2, 180)), bx = w - bw - 10, bh = bw * 0.62, by = 26, ok = c.lam >= 380 && c.lam <= 780;
				x.fillStyle = "#11182a"; x.fillRect(bx, by, bw, bh); x.strokeStyle = "#55607a"; x.strokeRect(bx, by, bw, bh);
				text(x, "MES", bx + bw / 2, by + bh / 2, Math.round(bh * 0.45), ok ? rgb(c.lam) : "#333a4a", "center", "middle", true); text(x, "what you see", bx + bw / 2, by + bh + 14, 11, "#aeb8cc", "center");
			},
			cards: function (p) { var c = this.calc(p), ok = c.lam >= 380 && c.lam <= 780; return card("Colour at this height", ok ? sw(c.lam) + Math.round(c.lam) + " nm" : "none", ok ? H.colourName(c.lam) : "this wavelength is invisible: the picture goes dark") + card("Colour blur from the slit", "± " + fmt(c.dl / 2, 3) + " nm", "A wider slit is brighter but mixes more colours.") + card("Parallax", "left-right only", "Up-down parallax was traded for colour."); } },
		{ id: "emboss", name: "Embossed (security)", hint: "Drag left / right to tilt",
			text: "<p>Banknotes, passports and cards carry <b>embossed</b> holograms: a rainbow master is turned into a surface relief (ridges about a micrometre apart and a tenth of a micrometre deep), stamped into plastic film by the million and coated with aluminium so it works by reflection. The ridges are a thin diffraction grating: tilt it and a different colour reaches your eye. Its brightness follows the thin phase-grating formula J₁²(φ/2), at most 34 %. Hard to copy because the master needs a holography lab; easy to recognise because of the colour shift.</p>",
			ctl: [["L", "Ridge spacing", 0.6, 2, 0.01, 1.1, function (v) { return fmt(v, 3) + " µm"; }], ["d", "Ridge depth", 20, 300, 1, 110, function (v) { return v + " nm"; }], ["la", "Lamp angle", 20, 60, 1, 35, function (v) { return v + "°"; }], ["tilt", "Tilt of the card", -20, 20, 0.25, 0, function (v) { return v + "°"; }]],
			calc: function (p) { var lam = p.L * (Math.sin((p.la - p.tilt) * DEG) + Math.sin(p.tilt * DEG)) * 1000; var eff = lam > 0 ? H.thinPhaseEff(H.reliefPhase(p.d / 1000, lam / 1000)) : 0; return { lam: lam, eff: eff }; },
			draw: function (x, w, h, p) {
				var c = this.calc(p), sx = 20, sw0 = Math.min(w * 0.5, 420), sy = h * 0.62, amp = Math.min(22, p.d / 300 * 22 + 3), per = 40 * p.L;
				x.fillStyle = "#26304a"; x.fillRect(sx, sy, sw0, h - sy - 16);
				x.beginPath(); for (var i = 0; i <= sw0; i++) { var yy = sy - amp * (0.5 + 0.5 * Math.sin(TAU * i / per)); if (i) x.lineTo(sx + i, yy); else x.moveTo(sx, yy); } x.strokeStyle = "#d9dee8"; x.lineWidth = 3; x.stroke();
				text(x, "plastic", sx + 8, h - 28, 11, "#aeb8cc"); text(x, "aluminium coat on the stamped ridges", sx + sw0 / 2, sy + 20, 11, "#d9dee8", "center");
				var mx = sx + sw0 / 2, my = sy - amp, la = (p.la) * DEG;
				lamp(x, mx - Math.sin(la) * h * 0.5, my - Math.cos(la) * h * 0.5); arrow(x, mx - Math.sin(la) * h * 0.45, my - Math.cos(la) * h * 0.45, mx, my, "#fff", 2);
				[430, 480, 530, 580, 630, 680].forEach(function (l) { var s = l / 1000 / p.L - Math.sin(la); if (Math.abs(s) > 1) return; var a = Math.asin(s); arrow(x, mx, my, mx - Math.sin(a) * h * 0.42, my - Math.cos(a) * h * 0.42, rgb(l, 0.9), 1.6); });
				line(x, mx, my, mx + Math.sin(la) * h * 0.4, my - Math.cos(la) * h * 0.4, "rgba(255,255,255,0.35)", 1.5, [5, 4]); text(x, "mirror reflection", mx + Math.sin(la) * h * 0.4, my - Math.cos(la) * h * 0.4 - 10, 10, "#aeb8cc", "center");
				// the card as seen
				var bx = sx + sw0 + 30, bw = Math.max(120, w - bx - 20), bh = Math.min(h - 50, bw * 0.62), by = 30, ok = c.lam >= 380 && c.lam <= 780, b = ok ? Math.min(1, 0.25 + c.eff * 2.2) : 0.1;
				x.save(); x.translate(bx + bw / 2, by + bh / 2); x.transform(1, 0, Math.tan(p.tilt * DEG) * 0.6, 1, 0, 0);
				x.fillStyle = "#1a2234"; x.fillRect(-bw / 2, -bh / 2, bw, bh);
				var g = x.createLinearGradient(-bw / 2, 0, bw / 2, 0), base = ok ? c.lam : 560; [-40, -15, 0, 15, 40].forEach(function (d2, i) { var l = Math.max(390, Math.min(760, base + d2)); g.addColorStop(i / 4, ok ? rgb(l, b) : "rgba(70,80,100,0.6)"); });
				x.fillStyle = g; x.beginPath(); for (i = 0; i < 6; i++) { var a2 = i * TAU / 6, r = bh * 0.38; x.lineTo(Math.cos(a2) * r, Math.sin(a2) * r); } x.closePath(); x.fill();
				x.restore(); text(x, "the sticker, straight on", bx + bw / 2, by + bh + 14, 11, "#aeb8cc", "center");
			},
			cards: function (p) { var c = this.calc(p), ok = c.lam >= 380 && c.lam <= 780; return card("Colour toward you", ok ? sw(c.lam) + Math.round(c.lam) + " nm" : "none", ok ? H.colourName(c.lam) : "outside the visible range: the sticker looks grey") + card("Brightness of that colour", fmt(c.eff * 100, 3) + " %", "Thin phase grating, J₁²(φ/2), φ = 4π·depth/λ. Best (34 %) near depth ≈ " + Math.round(0.293 * (ok ? c.lam : 550)) + " nm.") + card("Thin or thick?", "thin", "Q = " + fmt(H.kleinCook(0.55, p.d / 1000, 1.5, p.L), 2) + ": no Bragg selection, so all colours diffract, each at its own angle."); } },
		{ id: "ghost", name: "Pepper's ghost (not a hologram)", hint: "Drag the hidden figure",
			text: "<p>The \"holograms\" of singers on stage, theme-park ghosts and many \"holographic\" displays are <b>Pepper's ghost</b> (John Henry Pepper, 1862): a large sheet of clear glass or thin foil, tilted toward the audience, reflects a brightly lit figure or a video screen hidden below or beside the stage. The audience sees the reflection floating behind the glass, overlaid on the real stage. There is no interference and no recorded wave: it is a plain mirror image of a flat picture, so it has no true 3D depth and no parallax beyond that of a flat sheet. Glass reflects only a few percent, which is why the hidden figure must be very bright and the stage dark. At 45° an actor lying flat appears standing upright; other angles tip the ghost over. Modern versions use a bright LED screen lying face up instead of an actor.</p>",
			ctl: [["ga", "Glass tilt", 25, 65, 0.5, 45, function (v) { return v + "°"; }]],
			draw: function (x, w, h, p) {
				// Victorian layout: the glass leans toward the audience from the front edge of the stage; an actor lies in the dark pit under it, lit brightly.
				var floor = h * 0.52, gx = w * 0.42, ga = p.ga * DEG, gl = Math.min(h * 0.62, (w * 0.5) / Math.cos(ga)), a = { x: gx, y: floor }, b = { x: gx + Math.cos(ga) * gl, y: floor - Math.sin(ga) * gl };
				var fx = p.fx == null ? 0.6 : p.fx, fy = p.fy == null ? 0.78 : p.fy, L = h * 0.2, f = { x: w * fx, y: h * fy }, feet = { x: f.x - L / 2, y: f.y }, head = { x: f.x + L / 2, y: f.y };
				var iF = H.reflectPoint(feet, a, b), iH = H.reflectPoint(head, a, b), im = H.reflectPoint(f, a, b), ex = w - 30, ey = floor - h * 0.16;
				x.fillStyle = "#151c2c"; x.fillRect(gx, floor, w - gx, h - floor);
				line(x, 0, floor, gx, floor, "#8792a8", 3); text(x, "stage", 12, floor + 16, 11, "#8792a8");
				text(x, "dark pit: the actor lies here, brightly lit", gx + 8, h - 12, 11, "#8792a8");
				line(x, a.x, a.y, b.x, b.y, "rgba(150,210,255,0.85)", 3); text(x, "sheet of glass", b.x, b.y - 12, 11, "#9fd4ff", "center");
				function person(p0, p1, col) { var dx = p1.x - p0.x, dy = p1.y - p0.y, Ln = Math.hypot(dx, dy) || 1; x.strokeStyle = col; x.lineCap = "round"; x.lineWidth = Ln * 0.2; x.beginPath(); x.moveTo(p0.x, p0.y); x.lineTo(p0.x + dx * 0.72, p0.y + dy * 0.72); x.stroke(); x.beginPath(); x.arc(p0.x + dx * 0.86, p0.y + dy * 0.86, Ln * 0.13, 0, TAU); x.fillStyle = col; x.fill(); x.lineCap = "butt"; }
				person(feet, head, "#ffd166"); person(iF, iH, "rgba(255,209,102,0.42)");
				text(x, "the ghost the audience sees", im.x, Math.max(14, Math.min(iF.y, iH.y) - 22), 11, "#ffd166", "center");
				var seen = false;
				for (var k2 = -1; k2 <= 1; k2++) {
					var ty = ey + k2 * 12, dx = ex - im.x, dy = ty - im.y, den = (b.x - a.x) * dy - (b.y - a.y) * dx, t = den ? ((im.x - a.x) * dy - (im.y - a.y) * dx) / den : -1;
					if (t > 0 && t < 1) { seen = true; var hx = a.x + t * (b.x - a.x), hy = a.y + t * (b.y - a.y); line(x, f.x, f.y, hx, hy, "rgba(255,209,102,0.85)", 1.5); line(x, hx, hy, ex, ty, "rgba(255,209,102,0.85)", 1.5); line(x, hx, hy, im.x, im.y, "rgba(255,209,102,0.35)", 1, [4, 4]); }
				}
				if (!seen) text(x, "the audience cannot see the reflection from here", w / 2, 18, 12, "#ffcf70", "center");
				eye(x, ex, ey, -1); text(x, "audience", ex - 6, ey + 22, 11, "#cfd6e6", "center");
				tc.__ghost = { f: f };
			},
			cards: function (p) { var R0 = H.fresnelR(1.52, p.ga); return card("Glass reflects", "≈ " + fmt(R0 * 100, 2) + " %", "Fresnel reflection of clear glass for light from the pit hitting the sheet at about " + p.ga + "°: the hidden figure must be about " + Math.round(1 / R0) + "× brighter than the stage seen through the glass.") + card("Interference fringes", "none", "Nothing is recorded: it is a live reflection.", "hg-bad") + card("Depth", "flat", "The ghost is the mirror image of the hidden figure, at the mirror point behind the glass."); } }
	];
	var tList = $("hg-t-list"); tList.innerHTML = TYPES.map(function (t) { return "<button type='button' role='tab' data-id='" + t.id + "'>" + esc(t.name) + "</button>"; }).join("");
	tList.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; T.type = b.getAttribute("data-id"); tBuild(); save(); });
	function ttype() { return TYPES.filter(function (t) { return t.id === T.type; })[0] || TYPES[0]; }
	function tParams() { var t = ttype(), p = {}, sv0 = T.p[t.id] || {}; t.ctl.forEach(function (c) { var def = c[2] === "seg" ? c[4] : c[5]; p[c[0]] = sv0[c[0]] != null ? sv0[c[0]] : def; }); if (sv0.fx != null) { p.fx = sv0.fx; p.fy = sv0.fy; } return p; }
	function tSet(k, v) { var t = ttype(); T.p[t.id] = T.p[t.id] || {}; T.p[t.id][k] = v; save(); }
	function tBuild() {
		var t = ttype(), p = tParams();
		[].forEach.call(tList.querySelectorAll("button"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-id") === t.id ? "true" : "false"); });
		$("hg-t-title").textContent = t.name; $("hg-t-text").innerHTML = t.text; $("hg-t-hint").textContent = t.hint || "";
		$("hg-t-ctl").innerHTML = t.ctl.map(function (c) {
			if (c[2] === "seg") return "<div class='tu-field'><span class='tu-label'>" + esc(c[1]) + "</span><div class='hg-seg' data-tk='" + c[0] + "' role='group' aria-label='" + esc(c[1]) + "'>" + c[3].map(function (o) { return "<button type='button' data-v='" + o[0] + "' aria-pressed='" + (p[c[0]] === o[0]) + "'>" + esc(o[1]) + "</button>"; }).join("") + "</div></div>";
			return "<div class='tu-field'><span class='tu-label' id='hg-tc-" + c[0] + "-l'>" + esc(c[1]) + ": <b id='hg-tc-" + c[0] + "-v'></b></span><input type='range' data-tk='" + c[0] + "' min='" + c[2] + "' max='" + c[3] + "' step='" + c[4] + "' value='" + p[c[0]] + "' aria-labelledby='hg-tc-" + c[0] + "-l'></div>";
		}).join("");
		tUpdate();
	}
	$("hg-t-ctl").addEventListener("input", function (e) { var k2 = e.target.getAttribute("data-tk"); if (!k2) return; tSet(k2, Number(e.target.value)); tUpdate(); });
	$("hg-t-ctl").addEventListener("click", function (e) { var b = e.target.closest(".hg-seg button"); if (!b) return; var g = b.parentNode; tSet(g.getAttribute("data-tk"), b.getAttribute("data-v")); [].forEach.call(g.querySelectorAll("button"), function (q) { q.setAttribute("aria-pressed", q === b ? "true" : "false"); }); tUpdate(); });
	function tUpdate() { var t = ttype(), p = tParams(); t.ctl.forEach(function (c) { var el = $("hg-tc-" + c[0] + "-v"); if (el && c[6]) el.textContent = c[6](p[c[0]]); }); tDraw(); $("hg-t-cards").innerHTML = t.cards(p); }
	function tDraw() { var t = ttype(), f = fitCanvas(tc, 0.5, 260, maxH()); f.x.fillStyle = "#070a12"; f.x.fillRect(0, 0, f.w, f.h); t.draw(f.x, f.w, f.h, tParams(), tt); }
	var tDrag = null;
	tc.addEventListener("pointerdown", function (e) { var t = ttype(), pt = ptr(tc, e); if (t.id === "ghost" && tc.__ghost && Math.hypot(pt.x - tc.__ghost.f.x, pt.y - tc.__ghost.f.y) < 50) { tDrag = "g"; tc.setPointerCapture(e.pointerId); } else if (t.id === "emboss" || t.id === "rainbow") { tDrag = { x: pt.x, y: pt.y }; tc.setPointerCapture(e.pointerId); } });
	tc.addEventListener("pointermove", function (e) {
		if (!tDrag) return; var t = ttype(), pt = ptr(tc, e), p = tParams();
		if (tDrag === "g") { tSet("fx", Math.max(0.5, Math.min(0.85, pt.x / tc.clientWidth))); tSet("fy", Math.max(0.6, Math.min(0.92, pt.y / tc.clientHeight))); }
		else if (t.id === "emboss") { tSet("tilt", Math.max(-20, Math.min(20, p.tilt + (pt.x - tDrag.x) / 8))); tDrag = { x: pt.x, y: pt.y }; tBuildVals(); }
		else if (t.id === "rainbow") { tSet("ea", Math.max(-15, Math.min(15, p.ea - (pt.y - tDrag.y) / 8))); tDrag = { x: pt.x, y: pt.y }; tBuildVals(); }
		tUpdate();
	});
	tc.addEventListener("pointerup", function () { tDrag = null; });
	function tBuildVals() { var p = tParams(); [].forEach.call($("hg-t-ctl").querySelectorAll("input[type=range]"), function (el) { el.value = p[el.getAttribute("data-tk")]; }); }

	/* ================================================================ 5. COMPUTER-GENERATED (Gerchberg-Saxton) */
	var G = S.g, gc = $("hg-g"), NG = 128, PD = 48, pad = new Uint8Array(PD * PD), gState = { phase: null, errs: [], left: 0, eff: 0, seed: 7, stale: true, rep: null };
	try { var sp0 = localStorage.getItem(KEY + ":pad"); if (sp0 && sp0.length === PD * PD) for (var q = 0; q < sp0.length; q++) pad[q] = sp0.charCodeAt(q) === 49 ? 1 : 0; else gPreset(G.pre); } catch (e) { gPreset(G.pre); }
	function padSave() { try { var s = ""; for (var i = 0; i < pad.length; i++) s += pad[i] ? "1" : "0"; localStorage.setItem(KEY + ":pad", s); } catch (e) { /* ignore */ } }
	function gPreset(id) {
		pad.fill(0); var c = document.createElement("canvas"); c.width = c.height = PD; var x = c.getContext("2d"); x.fillStyle = "#000"; x.fillRect(0, 0, PD, PD); x.fillStyle = "#fff"; x.strokeStyle = "#fff"; x.lineWidth = 3;
		if (id === "mes") { x.font = "bold 19px Arial,sans-serif"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("MES", PD / 2, PD / 2 + 1); }
		else if (id === "smile") { x.beginPath(); x.arc(24, 24, 19, 0, TAU); x.stroke(); x.beginPath(); x.arc(17, 18, 3, 0, TAU); x.arc(31, 18, 3, 0, TAU); x.fill(); x.beginPath(); x.arc(24, 26, 10, 0.2, Math.PI - 0.2); x.stroke(); }
		else if (id === "star") { x.beginPath(); for (var i = 0; i < 10; i++) { var a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 9 : 21; x.lineTo(24 + r * Math.cos(a), 25 + r * Math.sin(a)); } x.closePath(); x.fill(); }
		else if (id === "dots") { for (i = 0; i < 12; i++) { var a2 = i * TAU / 12; x.fillRect(Math.round(23 + 17 * Math.cos(a2)), Math.round(23 + 17 * Math.sin(a2)), 2, 2); } }
		else if (id === "arrow") { x.beginPath(); x.moveTo(8, 24); x.lineTo(34, 24); x.stroke(); x.beginPath(); x.moveTo(42, 24); x.lineTo(28, 12); x.lineTo(28, 36); x.closePath(); x.fill(); }
		var d = x.getImageData(0, 0, PD, PD).data; for (i = 0; i < PD * PD; i++) pad[i] = d[i * 4] > 110 ? 1 : 0;
		padSave(); gState.stale = true;
	}
	var pGpre = chips("hg-g-pre", [["mes", "MES"], ["smile", "Smiley"], ["star", "Star"], ["arrow", "Arrow (shows the twin's flip)"], ["dots", "Ring of dots"]], function () { return G.pre; }, function (v) { G.pre = v; gPreset(v); gStart(); });
	function gTarget() { var T2 = new Float64Array(NG * NG), ox = G.off ? NG / 2 + 10 : NG / 2 - PD / 2, oy = G.off ? 6 : NG / 2 - PD / 2; for (var i = 0; i < PD; i++) for (var j = 0; j < PD; j++) if (pad[i * PD + j]) T2[(oy + i) * NG + ox + j] = 1; return T2; }
	function gStart(newSeed) {
		if (newSeed) gState.seed = (gState.seed * 1103515245 + 12345) >>> 0 || 3;
		var T2 = gTarget(), r = H.gs(T2, NG, { iters: 0, seed: gState.seed, levels: Number(G.lv) || 0 });
		gState.phase = r.phase; gState.errs = [r.err[0]]; gState.left = G.it; gState.target = T2; gState.stale = false; gState.eff = r.eff; mark("cgh");
	}
	function gStep(k) {
		if (!gState.left || !gState.phase) return; var n = Math.min(k, gState.left);
		for (var i = 0; i < n; i++) { var r = H.gs(gState.target, NG, { iters: 1, phase: gState.phase, levels: Number(G.lv) || 0 }); gState.phase = r.phase; gState.errs.push(r.err[r.err.length - 1]); gState.eff = r.eff; }
		gState.left -= n; mark("cgh");
	}
	function gLayout(w) { var gap = 14, cols = 2, ps = Math.floor((w - gap * 3) / cols); return { gap: gap, ps: ps, h: ps * 2 + gap * 3 + 36 }; }
	var gOff = document.createElement("canvas");
	function gDraw() {
		var L0 = gLayout(gc.parentNode.clientWidth || 600), f = fitCanvas(gc, L0.h / Math.max(260, gc.parentNode.clientWidth || 600), 300, 2000), x = f.x, w = f.w, Ly = gLayout(w), ps = Ly.ps, gp = Ly.gap;
		x.fillStyle = "#070a12"; x.fillRect(0, 0, w, f.h);
		var P = [[gp, gp + 16], [gp * 2 + ps, gp + 16], [gp, gp * 2 + ps + 32], [gp * 2 + ps, gp * 2 + ps + 32]];
		// pad
		var cs = ps / PD; x.fillStyle = "#11182a"; x.fillRect(P[0][0], P[0][1], ps, ps);
		for (var i = 0; i < PD; i++) for (var j = 0; j < PD; j++) if (pad[i * PD + j]) { x.fillStyle = "#ffd166"; x.fillRect(P[0][0] + j * cs, P[0][1] + i * cs, Math.ceil(cs), Math.ceil(cs)); }
		text(x, "1. Your picture (draw here)", P[0][0], P[0][1] - 9, 12, "#e6ebf5");
		// replay
		if (gState.phase) {
			var I = H.cghReplay(gState.phase, NG, G.d / 100), mx = 0; for (i = 0; i < I.length; i++) if (I[i] > mx) mx = I[i];
			var tgMax = 0; for (i = 0; i < I.length; i++) if (gState.target[i] > 0 && I[i] > tgMax) tgMax = I[i];
			var norm = Math.max(tgMax, mx * 0.02) || 1;
			grey(gOff, I, NG, function (v) { var t = Math.min(1, Math.pow(v / norm, 0.55)); return [255 * t, 80 * t + 40 * t * t, 70 * t * t]; });
			x.imageSmoothingEnabled = false; x.drawImage(gOff, P[1][0], P[1][1], ps, ps);
			var ph = gState.phase; grey(gOff, ph, NG, function (v) { var t = v / TAU; return [255 * t, 255 * t, 255 * t]; }); x.drawImage(gOff, P[2][0], P[2][1], ps, ps); x.imageSmoothingEnabled = true;
		}
		text(x, "2. Light pattern the hologram makes", P[1][0], P[1][1] - 9, 12, "#e6ebf5");
		text(x, "3. The phase hologram (black 0 → white 2π)", P[2][0], P[2][1] - 9, 12, "#e6ebf5");
		// error plot
		var ex = P[3][0], ey = P[3][1]; x.fillStyle = "#0d1220"; x.fillRect(ex, ey, ps, ps); text(x, "4. Error after each step", ex, ey - 9, 12, "#e6ebf5");
		var er = gState.errs, emx = er.length ? Math.max.apply(null, er) : 1; line(x, ex + 30, ey + ps - 20, ex + ps - 8, ey + ps - 20, "#55607a", 1); line(x, ex + 30, ey + 10, ex + 30, ey + ps - 20, "#55607a", 1);
		x.beginPath(); er.forEach(function (e, k3) { var X = ex + 30 + k3 / Math.max(1, G.it) * (ps - 40), Y = ey + ps - 20 - e / (emx || 1) * (ps - 34); if (k3) x.lineTo(X, Y); else x.moveTo(X, Y); }); x.strokeStyle = "#5ec8ff"; x.lineWidth = 2; x.stroke();
		if (er.length) text(x, fmt(er[er.length - 1] * 100, 3) + " %", ex + ps - 10, ey + 20, 12, "#5ec8ff", "right");
		text(x, "step " + (er.length - 1), ex + ps - 10, ey + ps - 8, 10, "#8792a8", "right");
		gc.__pad = { x: P[0][0], y: P[0][1], s: ps };
		gCards();
	}
	function gCards() {
		var er = gState.errs, e = er.length ? er[er.length - 1] : 0, lv = Number(G.lv) || 0, tw = 0, tg = 0;
		if (gState.phase) { var I = H.cghReplay(gState.phase, NG, G.d / 100); for (var i = 0; i < NG * NG; i++) { var y = Math.floor(i / NG), x = i % NG; if (gState.target[i] > 0) { tg += I[i]; tw += I[((NG - y) % NG) * NG + (NG - x) % NG]; } } }
		var on = 0, all = 0; if (gState.phase) { var I2 = H.cghReplay(gState.phase, NG, G.d / 100); for (i = 0; i < I2.length; i++) { all += I2[i]; if (gState.target[i] > 0) on += I2[i]; } }
		$("hg-g-cards").innerHTML = card("Light on your picture", fmt(all ? on / all * 100 : 0, 3) + " %", "The rest is scattered noise" + (G.d < 100 ? " and the zero-order spot" : "") + ".") + card("Picture error", fmt(e * 100, 3) + " %", "Difference between the light pattern and your picture after scaling.") + card("Twin image", G.off && tg ? fmt(tw / tg * 100, 3) + " % as bright" : "–", lv === 2 ? "A binary (0 / π) hologram is real-valued, so its pattern is point-symmetric: the twin is always as bright as the picture." : "Continuous phase can suppress the twin.") + card("Phase steps", lv ? String(lv) : "continuous", lv && lv < 8 ? "Few steps waste light into other places." : "Fine enough to put almost all the light where wanted.");
	}
	var gDrag = false;
	function gPaint(e) { var p = gc.__pad, pt = ptr(gc, e); if (!p) return false; var j = Math.floor((pt.x - p.x) / p.s * PD), i = Math.floor((pt.y - p.y) / p.s * PD); if (i < -1 || j < -1 || i > PD || j > PD) return false; for (var a = -1; a <= 1; a++) for (var b = -1; b <= 1; b++) { var ii = i + a, jj = j + b; if (ii >= 0 && jj >= 0 && ii < PD && jj < PD && (Math.abs(a) + Math.abs(b) < 2)) pad[ii * PD + jj] = G.pen ? 1 : 0; } G.pre = ""; pGpre(); mark("cgh"); return true; }
	gc.addEventListener("pointerdown", function (e) { if (gPaint(e)) { gDrag = true; gc.setPointerCapture(e.pointerId); } });
	gc.addEventListener("pointermove", function (e) { if (gDrag) gPaint(e); });
	gc.addEventListener("pointerup", function () { if (gDrag) { gDrag = false; padSave(); save(); gStart(); } });
	$("hg-g-run").addEventListener("click", function () { gStart(); });
	$("hg-g-new").addEventListener("click", function () { gStart(true); });
	$("hg-g-clear").addEventListener("click", function () { pad.fill(0); padSave(); G.pre = ""; pGpre(); gState.phase = null; gState.errs = []; gState.left = 0; mark("cgh"); });
	$("hg-g-save").addEventListener("click", function () { if (!gState.phase) return; var c = document.createElement("canvas"); grey(c, gState.phase, NG, function (v) { var t = v / TAU; return [255 * t, 255 * t, 255 * t]; }); var a = document.createElement("a"); a.download = "mes-phase-hologram.png"; a.href = c.toDataURL("image/png"); a.click(); });
	segInit("hg-g-pen", function () { return G.pen; }, function (v) { G.pen = Number(v); });
	var lvSel = $("hg-g-lv"); lvSel.value = String(G.lv); lvSel.addEventListener("change", function () { G.lv = Number(lvSel.value); save(); gStart(); });
	bindRange("hg-g-it", function () { return G.it; }, function (v) { G.it = v; }, function (v) { return String(v); });
	bindRange("hg-g-d", function () { return G.d; }, function (v) { G.d = v; }, function (v) { return v + " % of 2π"; }, function () { mark("cgh"); });
	checkInit("hg-g-off", function () { return G.off; }, function (b) { G.off = b; }, function () { gStart(); });

	/* ================================================================ loop, resize, start */
	function redrawAll() { if (S.tab === "rec") { mark("rp"); rCards(); } else if (S.tab === "view") { fChips(); mark("view"); } else if (S.tab === "coh") mark("coh"); else if (S.tab === "types") tBuild(); else { if (!gState.phase) gStart(); mark("cgh"); } }
	var last = 0, busy = false;
	function frame(ts) {
		requestAnimationFrame(frame); if (document.hidden) return; var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts; tick(dt);
	}
	function tick(dt) {
		if (busy) return; busy = true;
		try {
			if (S.tab === "rec") { rsT += dt; rsDraw(); if (dirty.rp) { dirty.rp = false; rpDraw(); } }
			else if (S.tab === "view") { if (dirty.view) { dirty.view = false; vDraw(); fChips(); } }
			else if (S.tab === "coh") { cT += dt; cDraw(); }
			else if (S.tab === "types") { tt += dt; if (ttype().id === "gabor") tDraw(); }
			else { if (gState.left) gStep(2); if (dirty.cgh) { dirty.cgh = false; gDraw(); } }
		} finally { busy = false; }
	}
	var rto = null; function onResize() { clearTimeout(rto); rto = setTimeout(function () { mark("rp"); mark("view"); mark("cgh"); if (S.tab === "types") tDraw(); tick(0); }, 90); }
	window.addEventListener("resize", onResize);
	if (window.ResizeObserver) { var ro = new ResizeObserver(onResize); ro.observe(root); }
	try { var qs = new URLSearchParams(location.search); if (qs.get("tab")) S.tab = qs.get("tab"); if (qs.get("type") && TYPES.some(function (t) { return t.id === qs.get("type"); })) { S.tab = "types"; T.type = qs.get("type"); } } catch (e) { /* ignore */ }
	window.MESHologram = { tick: function (n) { for (var i = 0; i < (n || 1); i++) tick(0.05); }, state: S, gs: gState, show: showTab };
	rPtsUI(); rCards(); syncView(); pCw(); pCx(); pCm(); pLam(); pTh(); pK(); pZ(); pDl();
	showTab(S.tab, true); tick(0); requestAnimationFrame(frame);
})();
