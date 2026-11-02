/* MES Light & Metamaterials Lab (mes.fm/negative-index). Maths in lib.js (MESMeta). Four tabs:
 * neg  = ray picture of negative refraction (one surface, Veselago flat lens) + the perfect-lens transfer function;
 * wave = live 2D FDTD with Drude eps and mu (flat lens, angled beam);
 * diff = Fraunhofer diffraction calculator (slit, double slit, grating, white light);
 * light = ten small live demos of what light does. State: localStorage mes-negative-index:v1; links ?tab= */
(function () {
	"use strict";
	var M = window.MESMeta, root = document.getElementById("ni"); if (!M || !root) return;
	var $ = function (id) { return document.getElementById(id); }, KEY = "mes-negative-index:v1", DEG = Math.PI / 180, TAU = Math.PI * 2;
	var DEF = { tab: "neg", r: { mode: "iface", n: -1, ang: 35, d: 2, s: 1, pd: 0.25, pl: -2 }, w: { scene: "lens", mat: "nim1", loss: 0.02, br: 1.4, speed: 5, view: "field", sx: 80, sy: 90 },
		d: { pre: "young", lam: 532, a: "20", d: "100", N: 2, L: "2", white: false, ax: "y", z: -1 }, l: { demo: "refl", p: {} } };
	var S = JSON.parse(JSON.stringify(DEF));
	try { var sv = JSON.parse(localStorage.getItem(KEY)); if (sv) for (var k in DEF) { if (typeof DEF[k] === "object") { for (var j in DEF[k]) if (sv[k] && sv[k][j] != null) S[k][j] = sv[k][j]; } else if (sv[k] != null) S[k] = sv[k]; } } catch (e) { /* ignore */ }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
	function num(s) { var v = Number(String(s == null ? "" : s).trim().replace(/,/g, ".")); return v; }
	var fmt = M.sig;
	function fitCanvas(c, aspect, minH, maxH) {
		var w = Math.max(260, c.parentNode.clientWidth || 600), h = Math.round(w * aspect); h = Math.max(minH || 200, Math.min(maxH || 9999, h));
		var d = window.devicePixelRatio || 1;
		if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); c.style.height = h + "px"; }
		var x = c.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0); return { x: x, w: w, h: h };
	}
	function text(x, t, px, py, size, col, al, base) { x.font = (size || 13) + "px system-ui,Helvetica,Arial,sans-serif"; x.fillStyle = col || "#cfd6e6"; x.textAlign = al || "left"; x.textBaseline = base || "middle"; x.fillText(t, px, py); }
	function line(x, x0, y0, x1, y1, col, wd, dash) { x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.strokeStyle = col; x.lineWidth = wd || 1.5; x.setLineDash(dash || []); x.stroke(); x.setLineDash([]); }
	function arrow(x, x0, y0, x1, y1, col, wd) { line(x, x0, y0, x1, y1, col, wd); var a = Math.atan2(y1 - y0, x1 - x0), s = 8; x.beginPath(); x.moveTo(x1, y1); x.lineTo(x1 - s * Math.cos(a - 0.4), y1 - s * Math.sin(a - 0.4)); x.lineTo(x1 - s * Math.cos(a + 0.4), y1 - s * Math.sin(a + 0.4)); x.closePath(); x.fillStyle = col; x.fill(); }
	function maxH() { return Math.round(window.innerHeight * 0.72); }
	function card(h, big, small, cls) { return "<div class='ni-card'><h4>" + h + "</h4><span class='ni-big" + (cls ? " " + cls : "") + "'>" + big + "</span>" + (small ? "<small>" + small + "</small>" : "") + "</div>"; }
	function segInit(id, get, set) {
		var el = $(id); function paint() { [].forEach.call(el.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(get()) === b.getAttribute("data-v") ? "true" : "false"); }); }
		paint(); el.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; set(b.getAttribute("data-v")); paint(); save(); });
		return paint;
	}
	function ptr(c, e) { var r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
	var COL = { ray: "#ffd166", refl: "rgba(255,209,102,0.35)", pos: "#5ec8ff", neg: "#ff6fb5", norm: "rgba(220,226,240,0.45)", txt: "#dfe5f2", mut: "#9aa6bb" };

	/* ---------- tabs ---------- */
	var tabs = [].slice.call(root.querySelectorAll(".ni-tabs button")), panels = [].slice.call(root.querySelectorAll("[data-panel]"));
	function showTab(t, keep) {
		if (["neg", "wave", "diff", "light"].indexOf(t) < 0) t = "neg";
		S.tab = t; tabs.forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === t ? "true" : "false"); });
		panels.forEach(function (p) { p.hidden = p.getAttribute("data-panel") !== t; });
		if (!keep) save(); redraw();
	}
	tabs.forEach(function (b) { b.addEventListener("click", function () { showTab(b.getAttribute("data-tab")); }); });

	/* =========================== shared: one surface =========================== */
	function drawIface(x, w, h, n, angDeg, opt) {
		opt = opt || {}; var cy = h * 0.5, ox = w * 0.5, L = Math.min(w, h) * 0.46, neg = n < 0, mc = neg ? COL.neg : COL.pos;
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h);
		var gr = x.createLinearGradient(0, cy, 0, h); gr.addColorStop(0, neg ? "rgba(255,111,181,0.28)" : "rgba(94,200,255,0.22)"); gr.addColorStop(1, neg ? "rgba(255,111,181,0.08)" : "rgba(94,200,255,0.06)");
		x.fillStyle = gr; x.fillRect(0, cy, w, h - cy);
		line(x, 0, cy, w, cy, "rgba(230,235,245,0.7)", 1.5);
		line(x, ox, cy - L * 1.05, ox, cy + L * 1.05, COL.norm, 1.2, [6, 5]);
		text(x, "n₁ = " + fmt(opt.n1 || 1, 3), 12, 18, 13, COL.txt); text(x, "n₂ = " + fmt(n, 3) + (neg ? "  (negative index)" : ""), 12, h - 16, 13, mc);
		var n1 = opt.n1 || 1, t = angDeg * DEG, ix = ox - L * Math.sin(t), iy = cy - L * Math.cos(t);
		arrow(x, ix, iy, ox - L * 0.45 * Math.sin(t), cy - L * 0.45 * Math.cos(t), COL.ray, 3); line(x, ox - L * 0.47 * Math.sin(t), cy - L * 0.47 * Math.cos(t), ox, cy, COL.ray, 3);
		var R = n > 0 ? M.reflectance(n1, n, angDeg) : 0.05, t2 = Math.abs(n) < 1e-6 ? null : M.snell(n1, n, angDeg);
		if (t2 === null) R = 1;
		x.globalAlpha = 0.25 + 0.75 * Math.min(1, R * 3); arrow(x, ox, cy, ox + L * 0.8 * Math.sin(t), cy - L * 0.8 * Math.cos(t), "#ffd166", 2); x.globalAlpha = 1;
		x.beginPath(); x.arc(ox, cy, 38, -Math.PI / 2 - t, -Math.PI / 2); x.strokeStyle = COL.ray; x.lineWidth = 1.2; x.stroke(); text(x, "θ₁ = " + fmt(angDeg, 3) + "°", ox - 44 - 40 * Math.sin(t / 2), cy - 52, 12, COL.ray, "right");
		if (t2 !== null) {
			var u = t2 * DEG, ex = ox + L * Math.sin(u), ey = cy + L * Math.cos(u);
			arrow(x, ox, cy, ex, ey, mc, 3);
			x.beginPath(); if (u >= 0) x.arc(ox, cy, 44, Math.PI / 2 - u, Math.PI / 2); else x.arc(ox, cy, 44, Math.PI / 2, Math.PI / 2 - u); x.strokeStyle = mc; x.lineWidth = 1.2; x.stroke();
			text(x, "θ₂ = " + fmt(t2, 3) + "°", ox + (u >= 0 ? 52 : -52), cy + 62, 12, mc, u >= 0 ? "left" : "right");
			if (opt.arrows !== false) {   // energy flow vs wave vector inside the material
				var mx = ox + L * 0.62 * Math.sin(u), my = cy + L * 0.62 * Math.cos(u), px = Math.cos(u), py = -Math.sin(u), off = 16;
				arrow(x, mx + px * off, my + py * off, mx + px * off + 28 * Math.sin(u), my + py * off + 28 * Math.cos(u), "#e9eef8", 1.6); text(x, "energy", mx + px * (off + 6) + 32 * Math.sin(u), my + py * (off + 6) + 32 * Math.cos(u), 11, "#e9eef8");
				var sg = neg ? -1 : 1; arrow(x, mx - px * off, my - py * off, mx - px * off + sg * 28 * Math.sin(u), my - py * off + sg * 28 * Math.cos(u), "#9ef0a8", 1.6); text(x, neg ? "wavefronts (backward)" : "wavefronts", mx - px * (off + 8) + sg * 30 * Math.sin(u), my - py * (off + 8) + sg * 30 * Math.cos(u), 11, "#9ef0a8", "right");
			}
		} else text(x, "no refracted ray: all of it reflects", ox + 14, cy + 30, 13, COL.ray);
		return { t2: t2, R: R };
	}

	/* =========================== 1. NEGATIVE REFRACTION =========================== */
	var RR = S.r, rc = $("ni-r"), rHint = $("ni-r-hint");
	var NCH = [["−2", -2], ["−1", -1], ["−0.5", -0.5], ["+1 (air)", 1], ["+1.33 (water)", 1.33], ["+1.5 (glass)", 1.5], ["+2.42 (diamond)", 2.42]];
	$("ni-r-nch").innerHTML = NCH.map(function (c) { return "<button type='button' data-v='" + c[1] + "'>n = " + c[0] + "</button>"; }).join("");
	$("ni-r-nch").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; RR.n = +b.getAttribute("data-v"); $("ni-r-n").value = RR.n; rUpdate(); });
	var paintMode = segInit("ni-r-mode", function () { return RR.mode; }, function (v) { RR.mode = v; rUpdate(); });
	[["ni-r-n", "n"], ["ni-r-a", "ang"], ["ni-r-d", "d"], ["ni-r-s", "s"]].forEach(function (p) { var el = $(p[0]); el.value = RR[p[1]]; el.addEventListener("input", function () { RR[p[1]] = +el.value; rUpdate(); }); });
	var lensGeo = null;
	function rDraw() {
		var f = fitCanvas(rc, RR.mode === "lens" ? 0.5 : 0.58, 240, maxH()), x = f.x, w = f.w, h = f.h, n = Math.abs(RR.n) < 0.005 ? 0.005 : RR.n;
		if (RR.mode === "iface") { drawIface(x, w, h, n, RR.ang); rHint.textContent = "Drag above the surface to aim the ray"; return; }
		rHint.textContent = "Drag the source left and right";
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h);
		var span = Math.max(8, RR.s + RR.d * 2.2 + 1.5), k = w / span, sx0 = (RR.s + 0.6) * k, cy = h / 2, sl = sx0, sr = sx0 + RR.d * k, neg = n < 0, mc = neg ? COL.neg : COL.pos;
		x.fillStyle = neg ? "rgba(255,111,181,0.22)" : "rgba(94,200,255,0.18)"; x.fillRect(sl, 0, sr - sl, h); line(x, sl, 0, sl, h, mc, 1.2); line(x, sr, 0, sr, h, mc, 1.2);
		text(x, "n = " + fmt(n, 3), (sl + sr) / 2, 16, 13, mc, "center"); line(x, 0, cy, w, cy, COL.norm, 1, [4, 6]);
		var srcX = sx0 - RR.s * k, res = M.slabRays(n, RR.s, RR.d, span, [-56, -48, -40, -32, -24, -16, -8, -3, 3, 8, 16, 24, 32, 40, 48, 56]);
		x.save(); x.beginPath(); x.rect(0, 0, w, h); x.clip();
		res.rays.forEach(function (r) {
			x.beginPath(); for (var i = 0; i < r.pts.length; i += 2) { var px = srcX + r.pts[i] * k, py = cy + r.pts[i + 1] * k; if (i) x.lineTo(px, py); else x.moveTo(px, py); }
			x.strokeStyle = r.tir ? "rgba(255,209,102,0.35)" : "rgba(255,209,102,0.85)"; x.lineWidth = 1.4; x.stroke();
		});
		x.restore();
		x.beginPath(); x.arc(srcX, cy, 7, 0, TAU); x.fillStyle = "#fff4c2"; x.fill(); text(x, "source", srcX, cy - 16, 12, COL.txt, "center");
		var fo = res.foci;
		[["image 1 (inside)", fo.inside], ["image 2", fo.outside]].forEach(function (q) { if (q[1] == null) return; var px = srcX + q[1] * k; if (px > w) return; x.beginPath(); x.arc(px, cy, 9, 0, TAU); x.strokeStyle = "#9ef0a8"; x.lineWidth = 2; x.setLineDash([3, 3]); x.stroke(); x.setLineDash([]); text(x, q[0], px, cy + 22, 12, "#9ef0a8", "center"); });
		lensGeo = { k: k, sx0: sx0 };
	}
	function rUpdate() {
		$("ni-r-n-v").textContent = fmt(RR.n, 3) + (RR.n < 0 ? " (negative)" : ""); $("ni-r-a-v").textContent = fmt(RR.ang, 3) + "°"; $("ni-r-d-v").textContent = fmt(RR.d, 3) + " units"; $("ni-r-s-v").textContent = fmt(RR.s, 3) + " units";
		$("ni-r-n").value = RR.n; $("ni-r-a").value = RR.ang; $("ni-r-s").value = RR.s;
		[].forEach.call(root.querySelectorAll("[data-only]"), function (el) { el.hidden = el.getAttribute("data-only") !== RR.mode; });
		[].forEach.call($("ni-r-nch").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", +b.getAttribute("data-v") === RR.n ? "true" : "false"); });
		paintMode(); rDraw();
		var n = Math.abs(RR.n) < 0.005 ? 0.005 : RR.n, cards = $("ni-r-cards"), res = $("ni-r-res");
		if (RR.mode === "iface") {
			var t2 = M.snell(1, n, RR.ang), cr = M.critical(1, n);
			cards.innerHTML = card("Incoming angle θ₁", fmt(RR.ang, 4) + "°") + card("Refracted angle θ₂", t2 === null ? "none" : fmt(t2, 4) + "°", t2 === null ? "total internal reflection" : t2 < 0 ? "same side of the normal" : "other side of the normal", t2 !== null && t2 < 0 ? "ni-neg" : "ni-pos") +
				card("Speed of the wavefronts", "c / " + fmt(Math.abs(n), 3), n < 0 ? "they run backward, toward the surface" : "forward") + card("Critical angle", cr == null ? "none" : fmt(cr, 4) + "°", cr == null ? "light can always enter" : "above this nothing gets in");
			res.innerHTML = "<p class='tu-note'>Snell's law: 1 × sin " + fmt(RR.ang, 4) + "° = " + fmt(n, 4) + " × sin θ₂, so sin θ₂ = " + fmt(Math.sin(RR.ang * DEG) / n, 4) + ". " +
				(n < 0 ? "A negative index gives a negative angle: the ray leaves on the <b>same side</b> of the normal it arrived from. Inside, the wavefronts move backward (toward the surface, green arrow) while the energy moves away from it (white arrow): the wave vector and the energy flow point in opposite directions. That is why such materials are also called <b>left-handed</b>." : "An ordinary material: the ray crosses to the other side of the normal and bends toward it when n &gt; 1.") + "</p>";
		} else {
			var fo = M.slabFoci(n, RR.s, RR.d), miss = M.slabMiss(n, RR.s, RR.d, 40);
			cards.innerHTML = card("Image inside the slab", fo.inside == null ? "none" : fmt(fo.inside - RR.s, 4) + " units in", n < 0 ? "from the front face" : "a positive slab never focuses") +
				card("Image behind the slab", fo.outside == null ? "none" : fmt(fo.outside - RR.s - RR.d, 4) + " units out", fo.outside == null && n < 0 ? "the source is too far: d/|n| < a" : "from the back face") +
				card("Blur of a 40° ray", miss == null ? "–" : (Math.abs(miss) < 1e-9 ? "0" : fmt(Math.abs(miss), 3)) + " units", Math.abs(RR.n + 1) < 0.005 ? "n = −1 focuses every ray" : "paraxial focus vs a steep ray");
			res.innerHTML = "<p class='tu-note'>Veselago's flat lens (1968): a slab with n = −1 bends every ray back toward the axis, so all rays from the source meet again <b>inside</b> the slab (as far in as the source is in front) and again <b>behind</b> it (at d − a). Unlike a glass lens it has no axis and no focal length: move the source sideways and the image follows. It only images objects closer than the slab is thick. With any other negative index the rays no longer meet at one point (the blur number above), and with a positive index nothing focuses at all.</p>";
		}
		save();
	}
	function rPointer(e) {
		var p = ptr(rc, e), w = rc.clientWidth, h = rc.clientHeight;
		if (RR.mode === "iface") { var dx = p.x - w / 2, dy = h / 2 - p.y; if (dy < 4) return; RR.ang = Math.round(Math.min(85, Math.max(0, Math.abs(Math.atan2(dx, dy)) / DEG)) * 2) / 2; }
		else if (lensGeo) { var s = (lensGeo.sx0 - p.x) / lensGeo.k; RR.s = Math.round(Math.max(0.1, Math.min(4, s)) * 20) / 20; }
		rUpdate();
	}
	var rDrag = false;
	rc.addEventListener("pointerdown", function (e) { rDrag = true; rc.setPointerCapture(e.pointerId); rPointer(e); });
	rc.addEventListener("pointermove", function (e) { if (rDrag) rPointer(e); });
	rc.addEventListener("pointerup", function () { rDrag = false; }); rc.addEventListener("pointercancel", function () { rDrag = false; });
	rc.addEventListener("keydown", function (e) { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { var s = e.key === "ArrowLeft" ? -1 : 1; if (RR.mode === "iface") RR.ang = Math.max(0, Math.min(85, RR.ang + s)); else RR.s = Math.max(0.1, Math.min(4, RR.s - s * 0.05)); rUpdate(); e.preventDefault(); } });

	/* perfect lens transfer function */
	var pc = $("ni-p");
	[["ni-p-d", "pd"], ["ni-p-l", "pl"]].forEach(function (p) { var el = $(p[0]); el.value = RR[p[1]]; el.addEventListener("input", function () { RR[p[1]] = +el.value; pUpdate(); }); });
	function pUpdate() {
		var d = RR.pd, del = Math.pow(10, RR.pl); $("ni-p-d-v").textContent = fmt(d, 3) + " λ"; $("ni-p-l-v").textContent = fmt(del, 2);
		var f = fitCanvas(pc, 0.42, 220, 420), x = f.x, w = f.w, h = f.h, L = 46, Rm = 14, T = 16, B = 34, qMax = 6, yMin = -3, yMax = 2;
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h);
		function X(q) { return L + (w - L - Rm) * q / qMax; } function Y(v) { var l = Math.log10(Math.max(1e-6, v)); return T + (h - T - B) * (yMax - Math.max(yMin, Math.min(yMax, l))) / (yMax - yMin); }
		for (var e = yMin; e <= yMax; e++) { line(x, L, Y(Math.pow(10, e)), w - Rm, Y(Math.pow(10, e)), "rgba(255,255,255,0.08)", 1); text(x, e === 0 ? "1" : "10" + (e < 0 ? "⁻" : "") + "⁰¹²³"[Math.abs(e)], L - 6, Y(Math.pow(10, e)), 11, COL.mut, "right"); }
		for (var q = 0; q <= qMax; q++) { line(x, X(q), T, X(q), h - B, "rgba(255,255,255,0.06)", 1); text(x, String(q), X(q), h - B + 12, 11, COL.mut, "center"); }
		text(x, "detail finer than this needs evanescent waves →", X(1) + 6, T + 8, 11, "#ffd166"); line(x, X(1), T, X(1), h - B, "rgba(255,209,102,0.6)", 1.2, [4, 4]);
		text(x, "fineness of detail kₓ / k₀  (period = λ / that)", (L + w) / 2, h - 8, 11, COL.mut, "center");
		function curve(fn, col, wd, dash) { x.beginPath(); for (var i = 0; i <= 400; i++) { var qq = qMax * i / 400, v = fn(qq), px = X(qq), py = Y(v); if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.strokeStyle = col; x.lineWidth = wd; x.setLineDash(dash || []); x.stroke(); x.setLineDash([]); }
		curve(function (qq) { return M.cx.abs(M.freeT(qq, d)); }, "#9aa6bb", 2, [5, 4]);
		curve(function (qq) { return M.cx.abs(M.slabT(qq, [-1, del], [-1, del], d)); }, "#ff6fb5", 2.6);
		curve(function (qq) { return M.cx.abs(M.slabT(qq, [-1, 1e-12], [-1, 1e-12], d)); }, "#9ef0a8", 2, [7, 5]);
		var lx = w - Rm - 8; text(x, "no lens (same distance)", lx, T + 26, 11, "#c9d1df", "right"); text(x, "lossless n = −1 slab", lx, T + 42, 11, "#9ef0a8", "right"); text(x, "slab with your loss", lx, T + 58, 11, "#ff6fb5", "right");
		var q1 = M.resolution([-1, del], [-1, del], d, 40), q0 = 1;
		$("ni-p-res").innerHTML = "<p>With loss " + fmt(del, 2) + " and a slab " + fmt(d, 3) + " λ thick, detail is copied up to k<sub>x</sub> ≈ <b>" + fmt(q1, 3) + " k₀</b>, i.e. features down to a period of about <b>λ / " + fmt(q1, 3) + "</b> (an ordinary lens stops at λ, kₓ = k₀: " + fmt(q1 / q0, 3) + "× finer). Pendry's rule of thumb: the limit grows only like ln(1/loss) / thickness, so halving the loss buys little and a thin slab helps most.</p>";
		save();
	}

	/* =========================== 2. WAVE SIMULATION =========================== */
	var W = 300, H = 180, WL = 20, Wv = S.w, wc = $("ni-w"), yee = null, img = null, off = document.createElement("canvas"), peak = 0.05, running = true;
	off.width = W; off.height = H; var octx = off.getContext("2d");
	var MATS = [
		{ id: "nim1", name: "Metamaterial: ε = μ = −1 (n = −1)", eps: -1, mu: -1, kind: 3 },
		{ id: "nim2", name: "Metamaterial: ε = μ = −2 (n = −2)", eps: -2, mu: -2, kind: 3 },
		{ id: "eneg", name: "Only ε negative (like a metal): ε = −1, μ = +1", eps: -1, mu: 1, kind: 2 },
		{ id: "glass", name: "Ordinary glass: n = +1.5", eps: 2.25, mu: 1, kind: 1 },
		{ id: "none", name: "Nothing (empty space)", eps: 1, mu: 1, kind: 0 }];
	$("ni-w-mat").innerHTML = MATS.map(function (m) { return "<option value='" + m.id + "'>" + esc(m.name) + "</option>"; }).join("");
	function matOf() { return MATS.filter(function (m) { return m.id === Wv.mat; })[0] || MATS[0]; }
	function slabX0() { return Wv.scene === "lens" ? 110 : 150; } function slabX1() { return Wv.scene === "lens" ? 170 : W; }
	function wBuild() {
		var m = matOf(); yee = new M.Yee(W, H, { wl: WL }); yee.material(m.kind >= 2 ? m.eps : 1, m.kind === 3 ? m.mu : 1, Wv.loss);
		var x0 = slabX0(), x1 = slabX1(); if (m.kind) yee.paint(function (x) { return x >= x0 && x < x1 ? { kind: m.kind, er: m.eps } : null; });
		wSource(); peak = 0.05; wCards();
	}
	function wSource() { if (!yee) return; if (Wv.scene === "lens") { Wv.sx = Math.max(28, Math.min(slabX0() - 4, Wv.sx)); Wv.sy = Math.max(28, Math.min(H - 28, Wv.sy)); yee.pointSource(Wv.sx, Wv.sy, 1); } else yee.beamSource(50, 40, 30, 22, 0.2); }
	function nReal(m) { var om = yee ? yee.omega() : TAU / WL; if (m.kind === 1) return Math.sqrt(m.eps); if (m.kind === 0) return 1; var e = m.kind >= 2 ? M.drude(om, M.drudeWp(om, m.eps), Wv.loss * om) : [1, 0], u = m.kind === 3 ? M.drude(om, M.drudeWp(om, m.mu), Wv.loss * om) : [1, 0]; return { e: e, u: u, n: M.indexFrom(e, u) }; }
	function cfmt(z) { return fmt(z[0], 3) + (Math.abs(z[1]) > 5e-4 ? (z[1] >= 0 ? " + " : " − ") + fmt(Math.abs(z[1]), 2) + "i" : ""); }
	function wCards() {
		var m = matOf(), r = nReal(m), cards = $("ni-w-cards"), per = yee ? yee.t * yee.dt / WL : 0, nn = typeof r === "number" ? r : r.n[0];
		cards.innerHTML = (typeof r === "number" ? card("Refractive index", fmt(r, 3), m.kind === 1 ? "a plain dielectric, ε = " + fmt(m.eps, 3) : "vacuum") :
			card("ε at the source frequency", cfmt(r.e), "Drude model") + card("μ at the source frequency", cfmt(r.u), m.kind === 3 ? "Drude model" : "ordinary (not magnetic)") + card("Index n = √ε √μ", cfmt(r.n), Math.abs(r.n[0]) < 0.05 ? "imaginary: the wave cannot travel in it" : r.n[0] < 0 ? "negative: backward phase" : "")) +
			card("Time", "<span id='ni-w-t'>" + fmt(per, 3) + "</span>", "wave periods") +
			(Wv.scene === "lens" && m.kind === 3 && nn < 0 ? (function () { var a = slabX0() - Wv.sx, dd = slabX1() - slabX0(), f1 = Math.abs(nn) * a, f2 = dd / Math.abs(nn) - a;
				return card("Predicted images (ray optics)", (f1 <= dd ? fmt(f1 / WL, 3) + " λ inside" : "none inside") + " · " + (f2 >= 0 ? fmt(f2 / WL, 3) + " λ behind" : "none behind"), "dashed rings; source " + fmt(a / WL, 3) + " λ in front"); })() : "");
	}
	var wvBtns = [].slice.call(root.querySelectorAll(".ni-views [data-view]"));
	function paintViews() { wvBtns.forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-view") === Wv.view ? "true" : "false"); }); }
	wvBtns.forEach(function (b) { b.addEventListener("click", function () { Wv.view = b.getAttribute("data-view"); paintViews(); save(); wDraw(); }); });
	$("ni-w-scene").value = Wv.scene; $("ni-w-mat").value = Wv.mat; $("ni-w-loss").value = Wv.loss; $("ni-w-br").value = Wv.br; $("ni-w-speed").value = Wv.speed;
	$("ni-w-scene").addEventListener("change", function () { Wv.scene = this.value; save(); wBuild(); wDraw(); });
	$("ni-w-mat").addEventListener("change", function () { Wv.mat = this.value; save(); wBuild(); wDraw(); });
	$("ni-w-loss").addEventListener("input", function () { Wv.loss = +this.value; $("ni-w-loss-v").textContent = fmt(Wv.loss, 3) + " of the frequency"; save(); var m = matOf(); if (yee) { yee.material(m.kind >= 2 ? m.eps : 1, m.kind === 3 ? m.mu : 1, Wv.loss); wCards(); } });
	$("ni-w-br").addEventListener("input", function () { Wv.br = +this.value; $("ni-w-br-v").textContent = fmt(Wv.br, 3) + "×"; save(); wDraw(); });
	$("ni-w-speed").addEventListener("change", function () { Wv.speed = +this.value; save(); });
	$("ni-w-loss-v").textContent = fmt(Wv.loss, 3) + " of the frequency"; $("ni-w-br-v").textContent = fmt(Wv.br, 3) + "×";
	$("ni-w-play").addEventListener("click", function () { running = !running; this.textContent = running ? "❚❚ Pause" : "▶ Play"; this.setAttribute("aria-pressed", String(running)); });
	$("ni-w-step").addEventListener("click", function () { for (var i = 0; i < 20; i++) yee.step(); wDraw(); });
	$("ni-w-reset").addEventListener("click", function () { wBuild(); wDraw(); });
	$("ni-w-full").addEventListener("click", function () { var st = wc.parentNode; if (document.fullscreenElement) document.exitFullscreen(); else if (st.requestFullscreen) st.requestFullscreen(); });
	function wDraw() {
		if (!yee) return; var f = fitCanvas(wc, H / W, 200, maxH()), x = f.x, w = f.w, h = f.h, Ez = yee.Ez, I = yee.I, kind = yee.kind, N = W * H, i;
		if (!img) img = octx.createImageData(W, H); var d = img.data, intv = Wv.view === "int", mx = 0;
		for (i = 0; i < N; i++) { var xx = i % W, yy = (i / W) | 0; if (xx < 24 || yy < 24 || xx > W - 25 || yy > H - 25) continue; var a = intv ? I[i] : Math.abs(Ez[i]); var sI = yee.src.length === 1 ? Math.abs(xx - Wv.sx) + Math.abs(yy - Wv.sy) : 99; if (sI > 6 && a > mx) mx = a; }
		peak = Math.max(peak * 0.97, mx, 1e-6); var sc = Wv.br / peak;
		for (i = 0; i < N; i++) {
			var k = kind[i], br = 0, bg = 0, bb = 0;
			if (k === 3) { br = 52; bg = 14; bb = 40; } else if (k === 2) { br = 40; bg = 40; bb = 46; } else if (k === 1) { br = 10; bg = 34; bb = 50; } else { br = 8; bg = 10; bb = 20; }
			var r = br, g = bg, b = bb;
			if (intv) { var v = Math.min(1, Math.sqrt(I[i] * sc)); r += 255 * v; g += 235 * v; b += 170 * v; }
			else { var u = Ez[i] * sc; u = Math.max(-1, Math.min(1, u)); if (u > 0) { r += 255 * u; g += 150 * u; b += 30 * u; } else { r -= 30 * u; g -= 140 * u; b -= 255 * u; } }
			var j = i * 4; d[j] = r > 255 ? 255 : r; d[j + 1] = g > 255 ? 255 : g; d[j + 2] = b > 255 ? 255 : b; d[j + 3] = 255;
		}
		octx.putImageData(img, 0, 0); x.imageSmoothingEnabled = true; x.drawImage(off, 0, 0, w, h);
		var s = w / W, m = matOf(), r0 = nReal(m), nn = typeof r0 === "number" ? r0 : r0.n[0];
		if (m.kind) { line(x, slabX0() * s, 0, slabX0() * s, h, "rgba(255,255,255,0.35)", 1); if (slabX1() < W) line(x, slabX1() * s, 0, slabX1() * s, h, "rgba(255,255,255,0.35)", 1); }
		if (Wv.scene === "lens") {
			x.beginPath(); x.arc(Wv.sx * s, Wv.sy * s, 5, 0, TAU); x.strokeStyle = "#fff"; x.lineWidth = 1.5; x.stroke();
			if (m.kind === 3 && nn < 0) { var a = slabX0() - Wv.sx, dd = slabX1() - slabX0(), f1 = slabX0() + Math.abs(nn) * a, f2 = slabX1() + dd / Math.abs(nn) - a; [f1, f2].forEach(function (fx, q) { if ((q === 0 && fx > slabX1()) || (q === 1 && fx < slabX1())) return; x.beginPath(); x.arc(fx * s, Wv.sy * s, 9 * s / 1.5, 0, TAU); x.strokeStyle = "#9ef0a8"; x.setLineDash([3, 3]); x.lineWidth = 1.5; x.stroke(); x.setLineDash([]); }); }
		} else {   // ray-optics prediction of the beam direction
			var t = 30 * DEG, hy = 40 + (150 - 50) * Math.tan(t); line(x, 50 * s, 40 * s, 150 * s, hy * s, "rgba(255,255,255,0.4)", 1, [5, 5]);
			if (m.kind && Math.abs(nn) > 0.05) { var t2 = M.snell(1, nn, 30); if (t2 !== null) { var u = t2 * DEG, L2 = 120; line(x, 150 * s, hy * s, (150 + L2 * Math.cos(u)) * s, (hy + L2 * Math.sin(u)) * s, "#9ef0a8", 1.4, [5, 5]); text(x, "ray optics: " + fmt(t2, 3) + "°", (150 + 12) * s, (hy + (u < 0 ? 24 : -18)) * s, 12, "#9ef0a8"); } }
		}
		text(x, m.kind ? m.name.split(":")[0] : "", (slabX0() + 4) * s, h - 12, 12, "#e9eef8");
		var te = $("ni-w-t"); if (te) te.textContent = fmt(yee.t * yee.dt / WL, 3);
	}
	var wDragOn = false;
	function wPtr(e) { if (Wv.scene !== "lens") return; var p = ptr(wc, e), s = wc.clientWidth / W; Wv.sx = Math.round(p.x / s); Wv.sy = Math.round(p.y / s); wSource(); wCards(); wDraw(); }
	wc.addEventListener("pointerdown", function (e) { wDragOn = true; wc.setPointerCapture(e.pointerId); wPtr(e); });
	wc.addEventListener("pointermove", function (e) { if (wDragOn) wPtr(e); }); wc.addEventListener("pointerup", function () { if (wDragOn) save(); wDragOn = false; });
	paintViews();

	/* =========================== 3. DIFFRACTION =========================== */
	var Dd = S.d, dc = $("ni-d"), dHover = null;
	$("ni-d-pre").innerHTML = M.DIFF_PRESETS.map(function (p) { return "<button type='button' data-id='" + p.id + "'>" + esc(p.name) + "</button>"; }).join("");
	function loadPre(id) { var p = M.DIFF_PRESETS.filter(function (q) { return q.id === id; })[0]; if (!p) return; Dd.pre = id; Dd.lam = p.lam; Dd.a = String(p.a); Dd.d = String(p.d || ""); Dd.N = p.N; Dd.L = String(p.L); Dd.z = autoZoom(); dSync(); dUpdate(); }
	$("ni-d-pre").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) loadPre(b.getAttribute("data-id")); });
	function dVals() { var a = num(Dd.a), d = num(Dd.d), N = Math.max(1, Math.round(+Dd.N || 1)), L = num(Dd.L); return { lam: Dd.lam * 1e-3, a: a, d: N > 1 ? d : 0, N: N, L: L }; }   // micrometres
	function autoZoom() { var v = dVals(), s = v.N > 1 && v.d > 0 ? (v.d < 3 * v.a ? 2.6 * v.lam / v.d : 2.6 * v.lam / v.a) : 3.5 * v.lam / v.a; var deg = Math.asin(Math.min(1, s)) / DEG; return Math.max(-2, Math.min(0, Math.log10(Math.max(0.9, deg) / 90))); }
	function dSync() { $("ni-d-lam").value = Dd.lam; $("ni-d-a").value = Dd.a; $("ni-d-d").value = Dd.d; $("ni-d-N").value = Dd.N; $("ni-d-L").value = Dd.L; $("ni-d-white").checked = !!Dd.white; $("ni-d-z").value = Dd.z; paintAx(); [].forEach.call($("ni-d-pre").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-id") === Dd.pre ? "true" : "false"); }); }
	var paintAx = segInit("ni-d-ax", function () { return Dd.ax; }, function (v) { Dd.ax = v; dUpdate(); });
	$("ni-d-lam").addEventListener("input", function () { Dd.lam = +this.value; dUpdate(); });
	$("ni-d-white").addEventListener("change", function () { Dd.white = this.checked; dUpdate(); });
	$("ni-d-z").addEventListener("input", function () { Dd.z = +this.value; dUpdate(); });
	[["ni-d-a", "a"], ["ni-d-d", "d"], ["ni-d-N", "N"], ["ni-d-L", "L"]].forEach(function (p) { $(p[0]).addEventListener("input", function () { Dd[p[1]] = this.value; Dd.pre = ""; [].forEach.call($("ni-d-pre").querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", "false"); }); dUpdate(); }); });
	function dIntensity(sinT, v, lamUm) { return M.fraunhofer(sinT, lamUm, v.a, v.d, v.N); }
	function dUpdate() {
		var v = dVals(), err = "";
		if (!(v.a > 0)) err = "Type a slit width bigger than 0."; else if (v.N > 1 && !(v.d > 0)) err = "Type the slit spacing d (centre to centre)."; else if (v.N > 1 && v.d < v.a) err = "The spacing d must be at least the slit width a (the slits would overlap)."; else if (!(v.L > 0)) err = "Type a screen distance bigger than 0.";
		var thMax = Math.min(Dd.ax === "y" ? 80 : 90, 90 * Math.pow(10, Dd.z));
		$("ni-d-lam-v").textContent = Dd.white ? "white (400-700 nm)" : Dd.lam + " nm"; $("ni-d-z-v").textContent = "±" + fmt(thMax, 3) + "°";
		$("ni-d-lpm").textContent = v.N > 1 && v.d > 0 ? fmt(1000 / v.d, 4) + " lines per mm" : "";
		var p = M.DIFF_PRESETS.filter(function (q) { return q.id === Dd.pre; })[0]; $("ni-d-note").textContent = p ? p.note : "";
		var f = fitCanvas(dc, 0.42, 240, 460), x = f.x, w = f.w, h = f.h, L = 14, Rm = 14, band = 54, T = band + 22, B = 34;
		x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h);
		if (err) { text(x, err, w / 2, h / 2, 14, "#fca5a5", "center"); $("ni-d-res").innerHTML = "<p class='ni-neg'>" + esc(err) + "</p>"; save(); return; }
		var PW = w - L - Rm, xs = new Float32Array(PW + 1), cols = [], Lmm = v.L * 1000, yMax = Lmm * Math.tan(thMax * DEG);
		function sinAt(px) { var u = (px / PW) * 2 - 1; if (Dd.ax === "y") { var y = u * yMax; return y / Math.hypot(y, Lmm); } return Math.sin(u * thMax * DEG); }
		var lams = Dd.white ? [] : [Dd.lam]; if (Dd.white) for (var l = 400; l <= 700; l += 6) lams.push(l);
		var rgbs = lams.map(function (l) { return M.wlToRgb(l); }), sub = v.N > 4 ? 6 : 2, colMax = 1e-9, R = [], G = [], Bc = [];
		for (var px = 0; px <= PW; px++) {
			var I = 0, cr = 0, cg = 0, cb = 0;
			for (var li = 0; li < lams.length; li++) { var acc = 0; for (var s = 0; s < sub; s++) acc += dIntensity(sinAt(px + (s + 0.5) / sub - 0.5), v, lams[li] * 1e-3); acc /= sub; I += acc; cr += acc * rgbs[li][0]; cg += acc * rgbs[li][1]; cb += acc * rgbs[li][2]; }
			I /= lams.length; xs[px] = I; R.push(cr); G.push(cg); Bc.push(cb); colMax = Math.max(colMax, cr, cg, cb);
		}
		for (px = 0; px <= PW; px++) { var g = 1 / colMax; x.fillStyle = "rgb(" + Math.round(255 * Math.pow(R[px] * g, 0.6)) + "," + Math.round(255 * Math.pow(G[px] * g, 0.6)) + "," + Math.round(255 * Math.pow(Bc[px] * g, 0.6)) + ")"; x.fillRect(L + px, 8, 1.2, band); }
		text(x, "the screen", L + 4, band + 15, 11, COL.mut);
		var Ymax = 0; for (px = 0; px <= PW; px++) Ymax = Math.max(Ymax, xs[px]); Ymax = Math.max(Ymax, 1e-9);
		function Y(I) { return h - B - (h - B - T) * I / Ymax; }
		line(x, L, h - B, w - Rm, h - B, "rgba(255,255,255,0.25)", 1);
		var ticks = 6; for (var t = -ticks; t <= ticks; t += 2) { var tx = L + PW * (t / ticks + 1) / 2, lab = Dd.ax === "y" ? fmt(yMax * t / ticks, 3) : fmt(thMax * t / ticks, 3); line(x, tx, h - B, tx, h - B + 4, "rgba(255,255,255,0.4)", 1); text(x, lab, tx, h - B + 13, 11, COL.mut, "center"); }
		text(x, Dd.ax === "y" ? "position on the screen (mm)" : "angle θ (degrees)", w / 2, h - 8, 11, COL.mut, "center");
		if (v.N > 1) { x.beginPath(); for (px = 0; px <= PW; px++) { var e = M.fraunhofer(sinAt(px), (Dd.white ? 550 : Dd.lam) * 1e-3, v.a, 0, 1); var yy = Y(e * (Dd.white ? 1 : 1)); if (px) x.lineTo(L + px, yy); else x.moveTo(L + px, yy); } x.strokeStyle = "rgba(255,255,255,0.35)"; x.setLineDash([4, 4]); x.lineWidth = 1; x.stroke(); x.setLineDash([]); }
		var c0 = Dd.white ? [255, 255, 255] : M.wlToRgb(Dd.lam); x.beginPath(); for (px = 0; px <= PW; px++) { var yy2 = Y(xs[px]); if (px) x.lineTo(L + px, yy2); else x.moveTo(L + px, yy2); }
		x.strokeStyle = "rgb(" + Math.max(120, c0[0]) + "," + Math.max(120, c0[1]) + "," + Math.max(120, c0[2]) + ")"; x.lineWidth = 2; x.stroke();
		if (dHover != null && dHover >= 0 && dHover <= PW) { var hs = sinAt(dHover), th = Math.asin(hs) / DEG; line(x, L + dHover, T - 8, L + dHover, h - B, "rgba(255,255,255,0.5)", 1); text(x, "θ = " + fmt(th, 4) + "°, y = " + fmt(Lmm * Math.tan(th * DEG), 4) + " mm, I = " + fmt(xs[dHover] / Ymax, 3), Math.min(w - 10, Math.max(10, L + dHover + 8)), T - 6, 12, "#fff", L + dHover > w * 0.6 ? "right" : "left"); }
		dc._PW = PW; dc._L = L;
		/* results */
		var lam = (Dd.white ? 550 : Dd.lam) * 1e-3, mins = M.slitMinima(lam, v.a, 4), ords = v.N > 1 ? M.orders(lam, v.d, v.a, 8) : [], rows = "";
		rows += "<tr><th>Central bright band (between the first dark bands)</th><td>" + (mins.length ? fmt(2 * mins[0].deg, 4) + "° wide = " + fmt(2 * Lmm * Math.tan(mins[0].deg * DEG), 4) + " mm on the screen" : "fills the whole half-space (slit narrower than λ)") + "</td></tr>";
		rows += "<tr><th>Single-slit dark bands, a sin θ = m λ</th><td>" + (mins.length ? mins.map(function (q) { return "m=" + q.m + ": " + fmt(q.deg, 4) + "°"; }).join(" · ") : "none") + "</td></tr>";
		if (v.N > 1) {
			rows += "<tr><th>Bright maxima, d sin θ = m λ</th><td>" + ords.map(function (q) { return "m=" + q.m + ": " + fmt(q.deg, 4) + "°" + (q.missing ? " <i>(missing: on a slit zero)</i>" : ""); }).join(" · ") + "</td></tr>";
			rows += "<tr><th>Fringe spacing on the screen (small angles), λL/d</th><td>" + fmt(lam * v.L * 1000 / v.d, 4) + " mm</td></tr>";
			rows += "<tr><th>Resolving power, N × m (first order)</th><td>" + fmt(v.N, 4) + ": separates two colours " + fmt(lam * 1000 / v.N, 3) + " nm apart near " + fmt(lam * 1000, 4) + " nm</td></tr>";
		}
		$("ni-d-res").innerHTML = "<h3>The numbers" + (Dd.white ? " (at 550 nm)" : "") + "</h3><div class='ni-tw'><table class='ni-table'><tbody>" + rows + "</tbody></table></div><p class='tu-note'>Fraunhofer (far-field) formula: valid when L is much bigger than (slit size)² / λ. The brightness curve is normalised to its own maximum.</p>";
		save();
	}
	dc.addEventListener("pointermove", function (e) { var p = ptr(dc, e); dHover = Math.round(p.x - (dc._L || 14)); dUpdate(); });
	dc.addEventListener("pointerleave", function () { dHover = null; dUpdate(); });

	/* =========================== 4. WHAT LIGHT CAN DO =========================== */
	var lc = $("ni-l"), Ld = S.l, lt = 0;
	function refractVec(dx, dy, nx, ny, n1, n2) {   // unit direction d, unit normal n pointing against d; returns refracted unit vector or null (total internal reflection)
		var c1 = -(dx * nx + dy * ny), r = n1 / n2, k = 1 - r * r * (1 - c1 * c1); if (k < 0) return null; var c2 = Math.sqrt(k); return [r * dx + (r * c1 - c2) * nx, r * dy + (r * c1 - c2) * ny];
	}
	function segHit(px, py, dx, dy, ax, ay, bx, by) { var ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex; if (Math.abs(den) < 1e-12) return null; var t = ((ax - px) * ey - (ay - py) * ex) / den, u = ((ax - px) * dy - (ay - py) * dx) / den; return t > 1e-6 && u >= 0 && u <= 1 ? t : null; }
	var DEMOS = [
		{ id: "refl", name: "Reflection", ctl: [["a", "Angle of the incoming ray", 0, 85, 1, 40, "°"]], text: "A mirror sends light back at the same angle it arrived: angle of incidence = angle of reflection, both measured from the normal (dashed).",
			draw: function (x, w, h, p) { x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); var cy = h * 0.72, ox = w / 2, L = Math.min(w, h) * 0.6, t = p.a * DEG; x.fillStyle = "#3b4252"; x.fillRect(0, cy, w, 10); line(x, ox, cy, ox, cy - L, COL.norm, 1.2, [6, 5]); arrow(x, ox - L * Math.sin(t), cy - L * Math.cos(t), ox, cy, COL.ray, 3); arrow(x, ox, cy, ox + L * Math.sin(t), cy - L * Math.cos(t), COL.ray, 3); text(x, "θᵢ = " + p.a + "°", ox - 20, cy - 30, 13, COL.ray, "right"); text(x, "θᵣ = " + p.a + "°", ox + 20, cy - 30, 13, COL.ray); },
			cards: function (p) { return card("Angle in", p.a + "°") + card("Angle out", p.a + "°", "always equal"); } },
		{ id: "refr", name: "Refraction", ctl: [["n1", "Top medium n₁", 1, 2.5, 0.01, 1, ""], ["n2", "Bottom medium n₂", 1, 2.5, 0.01, 1.5, ""], ["a", "Angle of the incoming ray", 0, 85, 1, 40, "°"]], text: "Light changes speed when it enters a new medium (speed c/n), and a ray that arrives at an angle turns: n₁ sin θ₁ = n₂ sin θ₂. Some light is also reflected (Fresnel), more at grazing angles.",
			draw: function (x, w, h, p) { drawIface(x, w, h, p.n2, p.a, { n1: p.n1, arrows: false }); },
			cards: function (p) { var t2 = M.snell(p.n1, p.n2, p.a), R = M.reflectance(p.n1, p.n2, p.a); return card("Refracted angle", t2 === null ? "none" : fmt(t2, 4) + "°") + card("Reflected", (R < 1e-9 ? "0" : fmt(100 * R, 3)) + " %", "of the light (unpolarised)") + card("Speeds", "c/" + fmt(p.n1, 3) + " → c/" + fmt(p.n2, 3)); } },
		{ id: "tir", name: "Total internal reflection", ctl: [["n1", "Index of the glass", 1.2, 2.5, 0.01, 1.5, ""], ["a", "Angle inside the glass", 0, 85, 0.5, 35, "°"]], text: "Going from a dense medium into a thinner one, the ray bends away from the normal. Past the critical angle (sin θc = n₂/n₁) there is no refracted ray at all and 100% reflects. Optical fibre works this way.",
			draw: function (x, w, h, p) { var cy = h * 0.4, ox = w / 2, L = Math.min(w, h) * 0.5, t = p.a * DEG; x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); x.fillStyle = "rgba(94,200,255,0.22)"; x.fillRect(0, cy, w, h - cy); line(x, 0, cy, w, cy, "#dfe5f2", 1.5); line(x, ox, cy - L, ox, cy + L, COL.norm, 1.2, [6, 5]); text(x, "air n = 1", 12, 18, 13, COL.txt); text(x, "glass n = " + fmt(p.n1, 3), 12, h - 16, 13, COL.pos);
				arrow(x, ox - L * Math.sin(t), cy + L * Math.cos(t), ox, cy, COL.ray, 3); var t2 = M.snell(p.n1, 1, p.a), R = M.reflectance(p.n1, 1, p.a); x.globalAlpha = Math.max(0.2, R); arrow(x, ox, cy, ox + L * Math.sin(t), cy + L * Math.cos(t), COL.ray, 3); x.globalAlpha = 1; if (t2 !== null) arrow(x, ox, cy, ox + L * Math.sin(t2 * DEG), cy - L * Math.cos(t2 * DEG), COL.ray, 2.5); else text(x, "100% reflected", ox + 16, cy - 20, 14, "#ffd166");
				var cr = M.critical(p.n1, 1); line(x, ox, cy, ox - L * Math.sin(cr * DEG), cy + L * Math.cos(cr * DEG), "rgba(158,240,168,0.6)", 1.2, [3, 4]); text(x, "critical " + fmt(cr, 3) + "°", ox - L * Math.sin(cr * DEG) - 6, cy + L * Math.cos(cr * DEG), 12, "#9ef0a8", "right"); },
			cards: function (p) { var cr = M.critical(p.n1, 1), t2 = M.snell(p.n1, 1, p.a); return card("Critical angle", fmt(cr, 4) + "°") + card("Now", t2 === null ? "all reflected" : "escapes at " + fmt(t2, 3) + "°", t2 === null ? "total internal reflection" : fmt(100 * M.reflectance(p.n1, 1, p.a), 3) + " % reflected"); } },
		{ id: "disp", name: "Dispersion", ctl: [["i", "Angle the white light hits the prism", 20, 80, 0.5, 48, "°"], ["k", "Spread drawn bigger by", 1, 15, 0.5, 5, "×"]], text: "Glass slows blue light a little more than red (n depends on wavelength), so a prism bends blue more and white light fans out into a spectrum. BK7 glass: n = 1.514 for red, 1.522 for blue (Cauchy fit). The fan is drawn bigger than life by the factor you choose; the numbers are true.",
			draw: function (x, w, h, p) {
				x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); var s = Math.min(w * 0.42, h * 0.8), cx = w * 0.42, cy = h * 0.55, A = [cx, cy - s * 0.55], Bv = [cx - s * 0.5, cy + s * 0.32], Cv = [cx + s * 0.5, cy + s * 0.32];
				x.beginPath(); x.moveTo(A[0], A[1]); x.lineTo(Bv[0], Bv[1]); x.lineTo(Cv[0], Cv[1]); x.closePath(); x.fillStyle = "rgba(160,200,255,0.16)"; x.fill(); x.strokeStyle = "rgba(200,220,255,0.6)"; x.lineWidth = 1.5; x.stroke();
				var hx = (A[0] + Bv[0]) / 2, hy = (A[1] + Bv[1]) / 2, ex = Bv[0] - A[0], ey = Bv[1] - A[1], el = Math.hypot(ex, ey), nx = -ey / el, ny = ex / el;   // outward normal of the left face
				var ang = Math.atan2(-ny, -nx) - p.i * DEG, dx = Math.cos(ang), dy = Math.sin(ang), sx = hx - dx * s * 0.8, sy = hy - dy * s * 0.8; line(x, sx, sy, hx, hy, "#ffffff", 4);
				var nD = M.cauchyBK7(589);
				for (var l = 410; l <= 690; l += 20) {
					var n = nD + p.k * (M.cauchyBK7(l) - nD), r1 = refractVec(dx, dy, nx, ny, 1, n); if (!r1) continue; var c = M.wlToRgb(l), col = "rgb(" + c.join(",") + ")";
					var t = segHit(hx, hy, r1[0], r1[1], A[0], A[1], Cv[0], Cv[1]), hit = 0; if (t === null) { t = segHit(hx, hy, r1[0], r1[1], Bv[0], Bv[1], Cv[0], Cv[1]); hit = 1; } if (t === null) continue;
					var qx = hx + r1[0] * t, qy = hy + r1[1] * t; line(x, hx, hy, qx, qy, col, 1.2);
					var fx = hit ? Cv[0] - Bv[0] : Cv[0] - A[0], fy = hit ? Cv[1] - Bv[1] : Cv[1] - A[1], fl = Math.hypot(fx, fy), mx = fy / fl, my = -fx / fl; if (mx * r1[0] + my * r1[1] < 0) { mx = -mx; my = -my; }
					var r2 = refractVec(r1[0], r1[1], -mx, -my, n, 1); if (r2) line(x, qx, qy, qx + r2[0] * w, qy + r2[1] * w, col, 2);
				}
			},
			cards: function (p) { var nr = M.cauchyBK7(656), nb = M.cauchyBK7(486), dr = M.prismDeviation(nr, 60, p.i), db = M.prismDeviation(nb, 60, p.i); return card("n for red 656 nm", fmt(nr, 5)) + card("n for blue 486 nm", fmt(nb, 5)) + card("Deviation red / blue", dr == null || db == null ? "–" : fmt(dr, 4) + "° / " + fmt(db, 4) + "°", "60° BK7 prism") + card("True spread", dr == null || db == null ? "–" : fmt(db - dr, 3) + "°", "drawn " + p.k + "× bigger"); } },
		{ id: "diff", name: "Diffraction", ctl: [["a", "Slit width, in wavelengths", 1, 12, 0.1, 3, " λ"]], text: "A wave squeezed through a gap spreads out, and the narrower the gap the wider it spreads: the first dark band sits at sin θ = λ / a. The Diffraction tab has the full calculator (double slits, gratings, white light).",
			draw: function (x, w, h, p) { x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); var Lp = 20, PW = w - 40, cy = h * 0.58; x.beginPath(); for (var px = 0; px <= PW; px++) { var th = (px / PW * 2 - 1) * 90 * DEG, I = M.fraunhofer(Math.sin(th), 1, p.a, 0, 1), yy = cy - (cy - 30) * I; if (px) x.lineTo(Lp + px, yy); else x.moveTo(Lp + px, yy); var c = Math.round(255 * Math.sqrt(I)); x.fillStyle = "rgb(" + c + "," + Math.round(c * 0.3) + "," + Math.round(c * 0.2) + ")"; x.fillRect(Lp + px, h - 50, 1.2, 30); } x.strokeStyle = "#ff8f70"; x.lineWidth = 2; x.stroke(); text(x, "−90°", Lp, cy + 14, 11, COL.mut); text(x, "+90°", Lp + PW, cy + 14, 11, COL.mut, "right"); text(x, "0°", Lp + PW / 2, cy + 14, 11, COL.mut, "center"); },
			cards: function (p) { var m = M.slitMinima(1, p.a, 1); return card("First dark band", m.length ? "± " + fmt(m[0].deg, 4) + "°" : "none", "sin θ = λ/a") + "<div class='ni-card'><h4>More</h4><button type='button' class='tu-btn tu-btn--ghost' data-goto='diff'>Open the Diffraction tab</button></div>"; } },
		{ id: "intf", name: "Interference", ctl: [["s", "Distance between the two sources", 1, 10, 0.1, 4, " λ"]], text: "Two sources in step make waves that add where crests meet crests (bright) and cancel where crests meet troughs (dark). Bright lines point along sin θ = m λ / s.",
			draw: function (x, w, h, p) {
				var gw = 200, gh = Math.round(gw * h / w), id = x.createImageData(gw, gh), span = 30;
				for (var j = 0; j < gh; j++) for (var i = 0; i < gw; i++) { var X = i / gw * span + 0.5, Yv = (j / gh - 0.5) * span * gh / gw, I = M.twoSource(X, Yv, p.s, 1) / 4, k = (j * gw + i) * 4, fall = 1 / (1 + X * 0.03); id.data[k] = 255 * I * fall; id.data[k + 1] = 200 * I * fall; id.data[k + 2] = 90 * I * fall; id.data[k + 3] = 255; }
				var oc = document.createElement("canvas"); oc.width = gw; oc.height = gh; oc.getContext("2d").putImageData(id, 0, 0); x.imageSmoothingEnabled = true; x.drawImage(oc, 0, 0, w, h);
				[-1, 1].forEach(function (sg) { var py = h / 2 + sg * p.s / 2 * w / span; x.beginPath(); x.arc(0.5 * w / span, py, 5, 0, TAU); x.fillStyle = "#fff"; x.fill(); });
			},
			cards: function (p) { var o = M.orders(1, p.s, 0, 12); return card("Bright directions", o.length - 1 > 0 ? (o.length - 1) + " each side" : "only straight ahead", o.slice(0, 4).map(function (q) { return fmt(q.deg, 3) + "°"; }).join(", ")) + card("Wider spacing", "more fringes", "fringe angle ≈ λ / s"); } },
		{ id: "pol", name: "Polarization (Malus)", ctl: [["a", "First polarizer angle", 0, 180, 1, 0, "°"], ["m", "Middle polarizer (0 = none, 1 = in)", 0, 1, 1, 0, ""], ["b", "Middle polarizer angle", 0, 180, 1, 45, "°"], ["c", "Last polarizer angle", 0, 180, 1, 90, "°"]], text: "Light is a sideways wave, and a polarizer only passes the part that vibrates along its axis. Unpolarised light loses half at the first one; after that each polarizer passes cos² of the angle between it and the light (Malus's law). Two crossed polarizers block everything, yet slipping a third one at 45° between them lets 1/8 through.",
			draw: function (x, w, h, p) {
				x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); var cy = h / 2, list = [p.a].concat(p.m ? [p.b] : []).concat([p.c]), n = list.length, xs = [], I = 1, pol = null, segs = [];
				for (var i = 0; i < n; i++) xs.push(w * (0.22 + 0.6 * i / (n - 1)));
				var x0 = 20; segs.push([x0, xs[0], 1, null]); I = 0.5; pol = list[0];
				for (i = 0; i < n; i++) { var I2 = i === 0 ? 0.5 : I * Math.pow(Math.cos((list[i] - pol) * DEG), 2); if (i > 0) pol = list[i]; I = I2; segs.push([xs[i], i + 1 < n ? xs[i + 1] : w - 20, I, pol]); }
				segs.forEach(function (s) { x.fillStyle = "rgba(255,230,150," + (0.15 + 0.85 * s[2]) + ")"; x.fillRect(s[0], cy - 10 * Math.max(0.15, s[2] * 2), s[1] - s[0], 20 * Math.max(0.15, s[2] * 2)); var mid = (s[0] + s[1]) / 2; if (s[3] == null) { [0, 45, 90, 135].forEach(function (a) { line(x, mid - 22 * Math.cos(a * DEG), cy - 22 * Math.sin(a * DEG), mid + 22 * Math.cos(a * DEG), cy + 22 * Math.sin(a * DEG), "#fff", 1.4); }); } else if (s[2] > 1e-4) { var r = 26 * Math.sqrt(s[2] * 2); line(x, mid - r * Math.cos(s[3] * DEG), cy - r * Math.sin(s[3] * DEG), mid + r * Math.cos(s[3] * DEG), cy + r * Math.sin(s[3] * DEG), "#fff", 2.4); } text(x, fmt(100 * s[2], 3) + " %", mid, cy + 46, 12, COL.txt, "center"); });
				list.forEach(function (a, i) { x.save(); x.translate(xs[i], cy); x.beginPath(); x.ellipse(0, 0, 10, 46, 0, 0, TAU); x.fillStyle = "rgba(120,160,220,0.35)"; x.fill(); x.strokeStyle = "#9ab8e8"; x.stroke(); x.restore(); line(x, xs[i] - 40 * Math.cos(a * DEG) * 0.2, cy - 40 * Math.sin(a * DEG), xs[i] + 40 * Math.cos(a * DEG) * 0.2, cy + 40 * Math.sin(a * DEG), "#ffd166", 2); text(x, a + "°", xs[i], cy - 60, 12, "#ffd166", "center"); });
			},
			cards: function (p) { var I = 0.5, pol = p.a, list = p.m ? [p.b, p.c] : [p.c]; list.forEach(function (a) { I *= Math.pow(Math.cos((a - pol) * DEG), 2); pol = a; }); return card("After the first", "50 %", "unpolarised in") + card("Out at the end", fmt(100 * I, 4) + " %", p.m ? "three polarizers" : "I₀/2 · cos²(" + Math.abs(p.c - p.a) + "°)"); } },
		{ id: "slow", name: "Slow light", ctl: [["g", "Group index (log scale)", 0, 7.5, 0.05, 1.2, ""]], text: "A pulse of light travels at the group speed c/n_g. In glass n_g ≈ 1.5; in an ultra-cold cloud of sodium atoms using electromagnetically induced transparency, Lene Hau's team slowed a pulse to 17 m/s (1999), a group index of about 18 million. The pulse is also squeezed shorter by the same factor while it is inside. Drawn speed is capped so you can see it; the numbers are true.",
			anim: true, draw: function (x, w, h, p, t) {
				x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); var ng = Math.pow(10, p.g), vis = Math.min(ng, 25), m0 = w * 0.35, m1 = w * 0.65, top = h * 0.32, bot = h * 0.7, period = 6, ph = (t % period) / period, L = w - 40;
				x.fillStyle = "rgba(94,200,255,0.18)"; x.fillRect(m0, bot - 28, m1 - m0, 56); text(x, "medium", (m0 + m1) / 2, bot + 42, 12, COL.pos, "center"); text(x, "in vacuum", 12, top - 30, 12, COL.txt); text(x, "through the medium", 12, bot - 40, 12, COL.txt);
				function pulse(px, yy, width, col) { var g = x.createLinearGradient(px - width, 0, px + width, 0); g.addColorStop(0, "rgba(255,209,102,0)"); g.addColorStop(0.5, col); g.addColorStop(1, "rgba(255,209,102,0)"); x.fillStyle = g; x.fillRect(px - width, yy - 12, 2 * width, 24); }
				var s = 20 + ph * L * 1.6; pulse(s % (L + 60), top, 30, "rgba(255,209,102,1)");
				var dist = ph * L * 1.6, pos; var d0 = m0 - 20, inLen = (m1 - m0) * vis; if (dist < d0) pos = 20 + dist; else if (dist < d0 + inLen) pos = m0 + (dist - d0) / vis; else pos = m1 + (dist - d0 - inLen);
				pulse(pos, bot, pos > m0 && pos < m1 ? Math.max(3, 30 / vis) : 30, "rgba(255,209,102,1)");
			},
			cards: function (p) { var ng = Math.pow(10, p.g), v = M.groupSpeed(ng); return card("Group index n_g", fmt(ng, 3)) + card("Speed of the pulse", v > 1e5 ? fmt(v / 1000, 4) + " km/s" : fmt(v, 4) + " m/s", v < 1e3 ? fmt(v * 3.6, 3) + " km/h" : "") + card("Delay through 1 cm", fmt((ng - 1) * 0.01 / M.C * 1e9, 3) + " ns", "compared with vacuum"); } },
		{ id: "neg", name: "Negative refraction", ctl: [["n", "Index of the material", -2.5, 2.5, 0.01, -1, ""], ["a", "Angle of the incoming ray", 0, 85, 1, 35, "°"]], text: "With a negative index the ray stays on the same side of the normal. The first tab has the full picture, the flat lens and the perfect-lens limit, and the Wave tab simulates it with Maxwell's equations.",
			draw: function (x, w, h, p) { drawIface(x, w, h, Math.abs(p.n) < 0.01 ? 0.01 : p.n, p.a); },
			cards: function (p) { var t2 = M.snell(1, p.n, p.a); return card("Refracted angle", t2 === null ? "none" : fmt(t2, 4) + "°", t2 !== null && t2 < 0 ? "same side" : "") + "<div class='ni-card'><h4>More</h4><button type='button' class='tu-btn tu-btn--ghost' data-goto='neg'>Open the full tab</button></div>"; } },
		{ id: "cloak", name: "Cloaking (transformation optics)", ctl: [["on", "Cloak (0 = off, 1 = on)", 0, 1, 1, 1, ""], ["r1", "Hidden core radius", 0.1, 0.8, 0.01, 0.35, ""], ["r2", "Cloak outer radius", 0.4, 1.4, 0.01, 1, ""]], text: "Pendry, Schurig and Smith (2006): squeeze the space inside a circle into a ring, r′ = R₁ + r (R₂ − R₁)/R₂. A material whose ε and μ copy that squeeze steers light around the core and lets it out exactly where it would have gone, so whatever sits inside is invisible. The rays here follow the exact coordinate map (ray optics, one colour). The required material is strongly anisotropic and, at the inner edge, needs ε and μ near zero and infinity.",
			draw: function (x, w, h, p) {
				x.fillStyle = "#0b0f1a"; x.fillRect(0, 0, w, h); var R2 = Math.max(p.r2, p.r1 + 0.05), R1 = p.r1, k = Math.min(w, h) * 0.32, cx = w / 2, cy = h / 2;
				if (p.on) { x.beginPath(); x.arc(cx, cy, R2 * k, 0, TAU); x.arc(cx, cy, R1 * k, 0, TAU, true); x.fillStyle = "rgba(255,111,181,0.18)"; x.fill("evenodd"); }
				x.beginPath(); x.arc(cx, cy, R1 * k, 0, TAU); x.fillStyle = "#5b6577"; x.fill(); text(x, "hidden", cx, cy, 12, "#fff", "center");
				for (var i = -7; i <= 7; i++) {
					if (i === 0) continue;   // the ray straight at the centre is the one singular ray of the ideal cloak
					var y0 = i / 7 * Math.min(1.45, h / 2 / k - 0.05), xMin = -w / 2 / k, xMax = w / 2 / k;
					if (p.on) { var pts = M.cloakRay(y0, R1, R2, xMin, xMax, 500); x.beginPath(); for (var q = 0; q < pts.length; q += 2) { var px = cx + pts[q] * k, py = cy + pts[q + 1] * k; if (q) x.lineTo(px, py); else x.moveTo(px, py); } x.strokeStyle = COL.ray; x.lineWidth = 1.4; x.stroke(); }
					else { var hit = Math.abs(y0) < R1, xe = hit ? -Math.sqrt(R1 * R1 - y0 * y0) : xMax; line(x, cx + xMin * k, cy + y0 * k, cx + xe * k, cy + y0 * k, COL.ray, 1.4); }
				}
				text(x, p.on ? "rays bend around the core and leave undisturbed" : "without a cloak the object blocks light and casts a shadow", 12, h - 14, 12, COL.txt);
			},
			cards: function (p) { var R2 = Math.max(p.r2, p.r1 + 0.05); return card("Squeeze at the outer edge", "×" + fmt((R2 - p.r1) / R2, 3), "radial scale dr′/dr") + card("Behind the object", p.on ? "no shadow" : "shadow", p.on ? "every ray exits on its original line" : ""); } }
	];
	var lList = $("ni-l-list");
	lList.innerHTML = DEMOS.map(function (d) { return "<button type='button' role='tab' data-id='" + d.id + "'>" + esc(d.name) + "</button>"; }).join("");
	lList.addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; Ld.demo = b.getAttribute("data-id"); lBuild(); });
	function demo() { return DEMOS.filter(function (d) { return d.id === Ld.demo; })[0] || DEMOS[0]; }
	function lParams() { var d = demo(), p = {}, saved = Ld.p[d.id] || {}; d.ctl.forEach(function (c) { p[c[0]] = saved[c[0]] != null ? saved[c[0]] : c[5]; }); return p; }
	function lBuild() {
		var d = demo(), p = lParams();
		[].forEach.call(lList.querySelectorAll("button"), function (b) { b.setAttribute("aria-selected", b.getAttribute("data-id") === d.id ? "true" : "false"); });
		$("ni-l-title").textContent = d.name; $("ni-l-text").textContent = d.text;
		$("ni-l-ctl").innerHTML = d.ctl.map(function (c) { return "<div class='tu-field'><span class='tu-label' id='ni-lc-" + c[0] + "-l'>" + esc(c[1]) + ": <b id='ni-lc-" + c[0] + "-v'></b></span><input type='range' data-k='" + c[0] + "' min='" + c[2] + "' max='" + c[3] + "' step='" + c[4] + "' value='" + p[c[0]] + "' aria-labelledby='ni-lc-" + c[0] + "-l'></div>"; }).join("");
		lUpdate(); save();
	}
	$("ni-l-ctl").addEventListener("input", function (e) { var el = e.target; if (!el.getAttribute("data-k")) return; var d = demo(); Ld.p[d.id] = Ld.p[d.id] || {}; Ld.p[d.id][el.getAttribute("data-k")] = +el.value; lUpdate(); save(); });
	root.addEventListener("click", function (e) { var b = e.target.closest("[data-goto]"); if (b) { showTab(b.getAttribute("data-goto")); root.scrollIntoView({ behavior: "smooth", block: "start" }); } });
	function lUpdate() {
		var d = demo(), p = lParams();
		d.ctl.forEach(function (c) { var el = $("ni-lc-" + c[0] + "-v"); if (el) el.textContent = c[0] === "g" ? "10^" + fmt(p.g, 3) + " = " + fmt(Math.pow(10, p.g), 3) : (c[3] === 1 && c[2] === 0 && c[4] === 1 ? (p[c[0]] ? "on" : "off") : fmt(p[c[0]], 4) + c[6]); });
		lDraw(); $("ni-l-cards").innerHTML = d.cards(p);
	}
	function lDraw() { var d = demo(), f = fitCanvas(lc, 0.5, 240, maxH()); d.draw(f.x, f.w, f.h, lParams(), lt); }

	/* ---------- main loop ---------- */
	function redraw() { if (S.tab === "neg") { rUpdate(); pUpdate(); } else if (S.tab === "wave") wDraw(); else if (S.tab === "diff") dUpdate(); else lUpdate(); }
	var last = 0;
	function frame(ts) {
		requestAnimationFrame(frame); if (document.hidden) return; var dt = last ? Math.min(0.1, (ts - last) / 1000) : 0; last = ts;
		if (S.tab === "wave" && yee && running) { for (var i = 0; i < Wv.speed; i++) yee.step(); wDraw(); }
		else if (S.tab === "light" && demo().anim) { lt += dt; lDraw(); }
	}
	var rto = null; window.addEventListener("resize", function () { clearTimeout(rto); rto = setTimeout(redraw, 120); });
	if (window.ResizeObserver) { var ro = new ResizeObserver(function () { clearTimeout(rto); rto = setTimeout(redraw, 80); }); ro.observe(root); }
	try { var q = new URLSearchParams(location.search); if (q.get("tab")) S.tab = q.get("tab"); if (q.get("demo") && DEMOS.some(function (d) { return d.id === q.get("demo"); })) { S.tab = "light"; Ld.demo = q.get("demo"); } if (q.get("n") && isFinite(+q.get("n"))) RR.n = Math.max(-3, Math.min(3, +q.get("n"))); } catch (e) { /* ignore */ }
	window.MESMetaLab = { step: function (k) { for (var i = 0; i < (k || 1); i++) yee.step(); wDraw(); }, yee: function () { return yee; } };
	dSync(); wBuild(); lBuild(); showTab(S.tab, true); requestAnimationFrame(frame);
})();
