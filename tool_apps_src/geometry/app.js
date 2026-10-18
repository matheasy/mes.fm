/* MES Geometry & Angle Lab -- mes.fm/geometry (UI; maths in lib.js, global GE). localStorage "mes-geometry:v1". Links: ?tab=tri|lines|circle|poly */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("ge"); if (!root || !window.GE) return;
	var KEY = "mes-geometry:v1", T = GE.trim, PX = 50;
	var COL = { A: "#d64545", B: "#2e9e5b", C: "#3a6fd8" };
	var RELCOL = { corr: "#2e9e5b", alt: "#3a6fd8", altx: "#16a3a3", co: "#e08a1e", vert: "#8e55c7", lin: "#d64545" };
	var st = { tab: "tri", pre: "scalene", opts: { lens: true, angs: true, circ: false, inc: false, cent: false, grid: false, sim: false }, k: 0.6, th: 65, par: true, tilt: 12, sel: 3, cm: "insc", ang: 60, n: 5, free: false, ext: false, snap15: false };
	var tri = null, cp = { a: 20, b: 150, p: 250, c: 320 }, poly = null, focusH = null;
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) { ["tab", "pre", "cm"].forEach(function (k) { if (typeof s[k] === "string") st[k] = s[k]; }); ["k", "th", "tilt", "sel", "ang", "n"].forEach(function (k) { if (typeof s[k] === "number") st[k] = s[k]; }); ["par", "free", "ext", "snap15"].forEach(function (k) { if (typeof s[k] === "boolean") st[k] = s[k]; }); if (s.opts) Object.keys(st.opts).forEach(function (k) { if (typeof s.opts[k] === "boolean") st.opts[k] = s.opts[k]; }); } } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	var D2R = Math.PI / 180;
	function pol(c, r, deg) { return [c[0] + r * Math.cos(deg * D2R), c[1] - r * Math.sin(deg * D2R)]; }
	function pt(p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }
	function dir(P, Q) { return Math.atan2(-(Q[1] - P[1]), Q[0] - P[0]) / D2R; }
	function arcPath(c, r, a0, span) { var p0 = pol(c, r, a0), p1 = pol(c, r, a0 + span); return "M" + pt(p0) + " A" + r + "," + r + " 0 " + (span > 180 ? 1 : 0) + " 0 " + pt(p1); }
	function wedge(c, r, a0, span, cls, extra) { var p0 = pol(c, r, a0), p1 = pol(c, r, a0 + span); return '<path class="' + cls + '" ' + (extra || "") + ' d="M' + pt(c) + " L" + pt(p0) + " A" + r + "," + r + " 0 " + (span > 180 ? 1 : 0) + " 0 " + pt(p1) + ' Z"/>'; }
	function norm(a) { return ((a % 360) + 360) % 360; }
	function line(p, q, cls) { return '<line class="' + cls + '" x1="' + p[0].toFixed(1) + '" y1="' + p[1].toFixed(1) + '" x2="' + q[0].toFixed(1) + '" y2="' + q[1].toFixed(1) + '"/>'; }
	function text(p, t, cls, st2) { return '<text class="' + cls + '" x="' + p[0].toFixed(1) + '" y="' + (p[1] + 4.5).toFixed(1) + '"' + (st2 ? ' style="' + st2 + '"' : "") + ">" + t + "</text>"; }
	function handle(id, p, label, col) { return '<g><circle class="g-h" data-h="' + id + '" tabindex="0" role="slider" aria-label="Point ' + esc(label) + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="12"' + (col ? ' style="stroke:' + col + '"' : "") + "/>" + text(p, esc(label), "g-ht", col ? "fill:" + col : "") + "</g>"; }
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + (s || "") + "</div></div>"; }
	function vertexArc(V, P, Q, r) { var a1 = dir(V, P), a2 = dir(V, Q), d = ((a2 - a1 + 540) % 360) - 180, s = d > 0 ? a1 : a2; return { start: s, span: Math.abs(d), mid: s + Math.abs(d) / 2 }; }
	function svgPoint(svg, e) { var pt0 = svg.createSVGPoint(); pt0.x = e.clientX; pt0.y = e.clientY; var m = svg.getScreenCTM(); return m ? pt0.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }

	/* ---- dragging (all svgs) ---- */
	var drag = null;
	function wireSvg(svg, onMove, onClick) {
		svg.addEventListener("pointerdown", function (e) { var h = e.target.closest && e.target.closest("[data-h]"); if (h) { drag = { svg: svg, h: h.dataset.h }; try { svg.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); } else if (onClick) { var w = e.target.closest("[data-w]"); if (w) onClick(w.dataset.w); } });
		svg.addEventListener("pointermove", function (e) { if (!drag || drag.svg !== svg) return; var p = svgPoint(svg, e); onMove(drag.h, [p.x, p.y]); });
		var end = function () { if (drag && drag.svg === svg) drag = null; }; svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
		svg.addEventListener("keydown", function (e) {
			var h = e.target.closest && e.target.closest("[data-h]"); if (!h) return; var d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key]; if (!d) return; e.preventDefault();
			var c = h; var cx = +c.getAttribute("cx"), cy = +c.getAttribute("cy"), s = e.shiftKey ? 1 : 5; focusH = h.dataset.h; onMove(h.dataset.h, [cx + d[0] * s, cy + d[1] * s], true);
		});
	}
	function put(svg, html) { var a = document.activeElement, id = a && a.dataset && a.dataset.h && svg.contains(a) ? a.dataset.h : focusH; svg.innerHTML = html; if (id) { var n = svg.querySelector('[data-h="' + id + '"]'); if (n && (a && svg.contains(a) || focusH)) { n.focus({ preventScroll: true }); } } focusH = null; }

	/* ================= TRIANGLES ================= */
	var PSCALE = { "right-345": 50, "right-isos": 50, "30-60-90": 100, equilateral: 100, isosceles: 50, scalene: 50, obtuse: 50 }, PNAMES = [["right-345", "Right 3-4-5"], ["right-isos", "Right isosceles"], ["30-60-90", "30-60-90"], ["equilateral", "Equilateral"], ["isosceles", "Isosceles"], ["scalene", "Scalene"], ["obtuse", "Obtuse"]];
	function setPreset(id) {
		var P = GE.PRESETS[id], s = PSCALE[id], pts = P.map(function (p) { return [p[0] * s, -p[1] * s]; }), x0 = Math.min.apply(null, pts.map(function (p) { return p[0]; })), x1 = Math.max.apply(null, pts.map(function (p) { return p[0]; })), y0 = Math.min.apply(null, pts.map(function (p) { return p[1]; })), y1 = Math.max.apply(null, pts.map(function (p) { return p[1]; }));
		var ox = 320 - (x0 + x1) / 2, oy = 215 - (y0 + y1) / 2; tri = pts.map(function (p) { return [Math.round(p[0] + ox), Math.round(p[1] + oy)]; }); st.pre = id;
	}
	var TOPTS = [["lens", "Side lengths"], ["angs", "Angles"], ["circ", "Circumcircle"], ["inc", "Incircle"], ["cent", "Centres & Euler line"], ["grid", "Grid & snap"], ["sim", "Similar triangle"]];
	$("ge-tri-pre").innerHTML = PNAMES.map(function (p) { return '<button type="button" class="tu-chip" data-p="' + p[0] + '">' + p[1] + "</button>"; }).join("");
	$("ge-tri-opts").innerHTML = TOPTS.map(function (o) { return '<label class="ge-ck"><input type="checkbox" data-o="' + o[0] + '"> ' + o[1] + "</label>"; }).join("");
	function syncTriCtl() { [].forEach.call($("ge-tri-pre").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.p === st.pre)); }); [].forEach.call($("ge-tri-opts").querySelectorAll("input"), function (i) { i.checked = !!st.opts[i.dataset.o]; }); $("ge-sim-row").hidden = !st.opts.sim; $("ge-sim-k").value = st.k; $("ge-sim-ko").textContent = T(st.k, 2); }
	$("ge-tri-pre").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; setPreset(b.dataset.p); save(); syncTriCtl(); rTri(); });
	$("ge-tri-opts").addEventListener("change", function (e) { st.opts[e.target.dataset.o] = e.target.checked; save(); syncTriCtl(); rTri(); });
	$("ge-sim-k").addEventListener("input", function () { st.k = +this.value; $("ge-sim-ko").textContent = T(st.k, 2); save(); rTri(); });
	function rTri() {
		var A = tri[0], B = tri[1], C = tri[2], t = GE.triangle(A, B, C), o = st.opts, s = "", i;
		if (o.grid) for (i = 20; i < 640; i += 20) s += '<line class="g-grid" x1="' + i + '" y1="0" x2="' + i + '" y2="420"/>'; if (o.grid) for (i = 20; i < 420; i += 20) s += '<line class="g-grid" x1="0" y1="' + i + '" x2="640" y2="' + i + '"/>';
		if (!t) { s += '<polyline class="g-aux" points="' + [A, B, C].map(pt).join(" ") + '"/>'; }
		else {
			var G = GE.centroid(A, B, C);
			if (o.circ) { var cc = GE.circumcircle(A, B, C); if (cc) s += '<circle class="g-aux" cx="' + cc.c[0] + '" cy="' + cc.c[1] + '" r="' + cc.r + '"/>'; }
			if (o.inc) { var ic = GE.incircle(A, B, C); if (ic) s += '<circle class="g-aux" style="stroke:#e08a1e" cx="' + ic.c[0] + '" cy="' + ic.c[1] + '" r="' + ic.r + '"/>'; }
			if (o.sim) { var S = GE.scaleAbout([A, B, C], A, st.k); s += '<polygon class="g-sim" points="' + S.map(pt).join(" ") + '"/>' + text([S[1][0], S[1][1] + (S[1][1] > A[1] ? 18 : -10)], "B′", "g-ta", "fill:#d97706") + text([S[2][0], S[2][1] + (S[2][1] > A[1] ? 18 : -10)], "C′", "g-ta", "fill:#d97706"); }
			s += '<polygon class="g-tri" points="' + [A, B, C].map(pt).join(" ") + '"/>';
			var V = [A, B, C], nm = ["A", "B", "C"], angs = [t.A, t.B, t.C];
			if (o.angs) for (i = 0; i < 3; i++) {
				var P = V[(i + 1) % 3], Q = V[(i + 2) % 3], va = vertexArc(V[i], P, Q), col = COL[nm[i]];
				if (Math.abs(angs[i] - 90) <= 0.6) { var u = pol([0, 0], 1, va.start), w = pol([0, 0], 1, va.start + 90), c0 = V[i], q = 22; s += '<polyline class="g-line" style="stroke:' + col + '" points="' + pt([c0[0] + (u[0]) * q, c0[1] + u[1] * q]) + " " + pt([c0[0] + u[0] * q + w[0] * q, c0[1] + u[1] * q + w[1] * q]) + " " + pt([c0[0] + w[0] * q, c0[1] + w[1] * q]) + '"/>'; }
				else s += wedge(V[i], 30, va.start, va.span, "", 'style="fill:' + col + ';fill-opacity:0.28;stroke:' + col + ';stroke-width:2"');
				var lp = pol(V[i], 52, va.mid); s += text(lp, T(angs[i], 1) + "°", "g-ta", "fill:" + col);
			}
			if (o.lens) { var sides = [[B, C, "a", t.a], [C, A, "b", t.b], [A, B, "c", t.c]]; sides.forEach(function (sd) { var m = [(sd[0][0] + sd[1][0]) / 2, (sd[0][1] + sd[1][1]) / 2], dx = m[0] - G[0], dy = m[1] - G[1], n = Math.hypot(dx, dy) || 1; s += text([m[0] + dx / n * 20, m[1] + dy / n * 20], sd[2] + " = " + T(sd[3] / PX, 2), "g-t"); }); }
			if (o.cent) {
				var O = GE.circumcircle(A, B, C), H = GE.orthocenter(A, B, C);
				if (O && H) { if (Math.hypot(H[0] - O.c[0], H[1] - O.c[1]) > 1) s += line(O.c, H, "g-aux"); s += '<circle cx="' + G[0] + '" cy="' + G[1] + '" r="4.5" fill="#d64545"/>' + text([G[0] + 12, G[1] - 8], "G", "g-ts") + '<circle cx="' + O.c[0] + '" cy="' + O.c[1] + '" r="4.5" fill="#3a6fd8"/>' + text([O.c[0] + 12, O.c[1] - 8], "O", "g-ts") + '<circle cx="' + H[0] + '" cy="' + H[1] + '" r="4.5" fill="#2e9e5b"/>' + text([H[0] + 12, H[1] - 8], "H", "g-ts"); }
			}
		}
		s += handle("A", A, "A", COL.A) + handle("B", B, "B", COL.B) + handle("C", C, "C", COL.C); put($("ge-svg-tri"), s);
		var st1 = "", f = "";
		if (!t) { st1 = stat("Not a triangle", "—", "The three corners are in a straight line, or on top of each other."); f = "<p>Drag a corner away from the line through the other two.</p>"; }
		else {
			st1 = stat("Angle A", T(t.A, 2) + "°", "opposite side a", "") + stat("Angle B", T(t.B, 2) + "°", "opposite side b", "") + stat("Angle C", T(t.C, 2) + "°", "opposite side c", "") + stat("Sides", "a " + T(t.a / PX, 2) + " · b " + T(t.b / PX, 2) + " · c " + T(t.c / PX, 2), "1 square of the grid = 20 px = 0.4 units") +
				stat("Area", T(t.area / (PX * PX), 3), "square units") + stat("Perimeter", T(t.perimeter / PX, 3), "units") + stat("Kind", '<span class="ge-badge">' + t.byAngle + '</span><span class="ge-badge">' + t.bySide + "</span>", "by angles · by sides");
			var L = [], ps = T(t.A, 1) + "° + " + T(t.B, 1) + "° + " + T(t.C, 1) + "°", a = t.a / PX, b = t.b / PX, c = t.c / PX, R2 = GE.circumcircle(A, B, C);
			L.push("<b>Angle sum:</b> " + ps + " = <span class=\"ge-ok\">" + T(t.A + t.B + t.C, 1) + "°</span> (always 180° in a flat triangle).");
			L.push("<b>Exterior angle theorem:</b> the outside angle at C is " + T(180 - t.C, 1) + "°, which equals A + B = " + T(t.A + t.B, 1) + "°.");
			L.push("<b>Triangle inequality:</b> a + b = " + T(a + b, 2) + " &gt; c = " + T(c, 2) + " (each side is shorter than the other two together). The biggest angle faces the longest side.");
			if (t.byAngle === "right") { var hy = Math.max(a, b, c), lg = [a, b, c].sort(function (x, y) { return x - y; }); L.push("<b>Pythagoras:</b> " + T(lg[0], 2) + "² + " + T(lg[1], 2) + "² = " + T(lg[0] * lg[0] + lg[1] * lg[1], 2) + " ≈ " + T(hy, 2) + "² = " + T(hy * hy, 2) + ". The hypotenuse is a diameter of the circumcircle (Thales)."); }
			if (t.bySide === "equilateral") L.push("<b>Equilateral:</b> three equal sides force three equal angles of 60°.");
			else if (t.bySide === "isosceles") L.push("<b>Isosceles:</b> two equal sides, so the angles opposite them are equal (base angles theorem).");
			if (R2) L.push("<b>Law of sines:</b> a / sin A = " + T(a / Math.sin(t.A * D2R), 3) + ", b / sin B = " + T(b / Math.sin(t.B * D2R), 3) + ", c / sin C = " + T(c / Math.sin(t.C * D2R), 3) + " — all equal to the circumdiameter 2R = " + T(2 * R2.r / PX, 3) + ".");
			L.push("<b>Law of cosines:</b> c² = a² + b² − 2ab cos C = " + T(a * a + b * b - 2 * a * b * Math.cos(t.C * D2R), 3) + " = " + T(c * c, 3) + " ✓.");
			L.push("<b>Area</b> = ½ab sin C = " + T(0.5 * a * b * Math.sin(t.C * D2R), 3) + " square units.");
			if (st.opts.sim) { var k = st.k; L.push("<b>Similar triangles (AA):</b> the orange triangle AB′C′ has the same three angles, so it is similar. Every side is ×" + T(k, 2) + ": AB′/AB = AC′/AC = B′C′/BC = " + T(k, 2) + "; B′C′ is parallel to BC; its area is ×" + T(k * k, 3) + " (k²) = " + T(t.area * k * k / (PX * PX), 3) + "."); }
			f = '<h3 style="margin-top:0;">What is going on?</h3><ul class="ge-facts"><li>' + L.join("</li><li>") + "</li></ul>";
		}
		$("ge-tri-stats").innerHTML = st1; $("ge-tri-facts").innerHTML = f;
	}
	wireSvg($("ge-svg-tri"), function (h, p) {
		var x = Math.max(16, Math.min(624, p[0])), y = Math.max(16, Math.min(404, p[1])); if (st.opts.grid) { x = Math.round(x / 20) * 20; y = Math.round(y / 20) * 20; } tri[{ A: 0, B: 1, C: 2 }[h]] = [x, y]; st.pre = ""; syncTriCtl(); rTri();
	});

	/* ================= PARALLEL LINES ================= */
	var LW = { 1: "upper left", 2: "upper right", 3: "lower left", 4: "lower right" };
	var LEG = ["corr", "alt", "altx", "co", "vert", "lin"];
	$("ge-lines-legend").innerHTML = LEG.map(function (k) { return '<span><i style="background:' + RELCOL[k] + '"></i>' + GE.REL[k] + "</span>"; }).join("") + '<span><i style="background:#f2b01e"></i>selected</span>';
	function syncLinesCtl() { $("ge-th").value = st.th; $("ge-tho").textContent = Math.round(st.th); $("ge-par").checked = st.par; $("ge-tilt-row").hidden = st.par; $("ge-tilt").value = st.tilt; $("ge-tilto").textContent = st.tilt; }
	$("ge-th").addEventListener("input", function () { st.th = +this.value; save(); syncLinesCtl(); rLines(); });
	$("ge-par").addEventListener("change", function () { st.par = this.checked; save(); syncLinesCtl(); rLines(); });
	$("ge-tilt").addEventListener("input", function () { st.tilt = +this.value; save(); syncLinesCtl(); rLines(); });
	var LY1 = 130, LY2 = 290;
	function rLines() {
		var th = st.th, eps = st.par ? 0 : st.tilt, cot = Math.cos(th * D2R) / Math.sin(th * D2R), U = [320 + 80 * cot, LY1], L = [320 - 80 * cot, LY2], th2 = th - eps, ang = GE.transversal(th, th2), s = "";
		var d = [Math.cos(th * D2R), -Math.sin(th * D2R)];
		s += line([U[0] - 340 * d[0], U[1] - 340 * d[1]], [U[0] + 340 * d[0], U[1] + 340 * d[1]], "g-line");
		s += line([U[0] - 380, U[1]], [U[0] + 380, U[1]], "g-line");
		var ee = eps * D2R; s += line([L[0] - 380 * Math.cos(ee), L[1] + 380 * Math.sin(ee)], [L[0] + 380 * Math.cos(ee), L[1] - 380 * Math.sin(ee)], "g-line");
		if (st.par) { s += '<polyline class="g-line" style="stroke-width:1.8" points="' + [[44, LY1 - 7], [54, LY1], [44, LY1 + 7]].map(pt).join(" ") + '"/><polyline class="g-line" style="stroke-width:1.8" points="' + [[44, LY2 - 7], [54, LY2], [44, LY2 + 7]].map(pt).join(" ") + '"/>'; }
		var sel = st.sel, inter = [U, L], al = [0, eps];
		for (var ln = 0; ln < 2; ln++) for (var q = 1; q <= 4; q++) {
			var n = ln * 4 + q, a = al[ln], thv = th, a0, span;
			if (q === 2) { a0 = a; span = thv - a; } else if (q === 1) { a0 = thv; span = a + 180 - thv; } else if (q === 3) { a0 = a + 180; span = thv - a; } else { a0 = thv + 180; span = a + 360 - thv - 180; }
			var rel = sel === n ? "sel" : GE.relation(sel, n), fill = sel === n ? "#f2b01e" : rel ? RELCOL[rel] : "#9aa5b4", C0 = inter[ln];
			s += wedge(C0, 46, a0, span, "g-wedge" + (sel === n ? " g-sel" : ""), 'data-w="' + n + '" style="fill:' + fill + ';fill-opacity:' + (rel ? 0.7 : 0.25) + '"');
			var mid = a0 + span / 2; s += text(pol(C0, 30, mid), n, "g-ta", "pointer-events:none;fill:#111;font-size:14px"); s += text(pol(C0, 74, mid), T(ang[n - 1], 1) + "°", "g-ts", "pointer-events:none;font-weight:700");
		}
		var H = [U[0] + 120 * d[0], U[1] - 120 * d[1]]; s += handle("th", [U[0] + 150 * d[0], U[1] + 150 * d[1] * 1], "θ"); put($("ge-svg-lines"), s);
		// facts
		var L2 = [], rows = [];
		for (var j = 1; j <= 8; j++) { var r = GE.relation(sel, j); if (r) rows.push([j, r]); }
		rows.sort(function (x, y) { return LEG.indexOf(x[1]) - LEG.indexOf(y[1]); });
		rows.forEach(function (rw) {
			var j = rw[0], r = rw[1], rule = GE.relationRule(r), ok = GE.checkRelation(r, ang[sel - 1], ang[j - 1]), alw = (r === "vert" || r === "lin");
			var txt = "<b style=\"color:" + RELCOL[r] + "\">∠" + sel + " and ∠" + j + "</b> are " + GE.REL[r] + " angles: " + (rule === "equal" ? "equal when the lines are parallel" : "add to 180° ") + " (" + T(ang[sel - 1], 1) + "° " + (rule === "equal" ? "vs" : "+") + " " + T(ang[j - 1], 1) + "°" + (rule === "sum" ? " = " + T(ang[sel - 1] + ang[j - 1], 1) + "°" : "") + ") ";
			txt += alw ? "<span class=\"ge-ok\">always true ✓</span>" : ok ? "<span class=\"ge-ok\">✓ holds</span>" : "<span class=\"ge-bad\">✗ does not hold: the lines are not parallel</span>"; L2.push(txt);
		});
		var kinds = []; $("ge-lines-facts").innerHTML = '<h3 style="margin-top:0;">Angle ' + sel + " (" + (sel > 4 ? "lower line, " : "upper line, ") + LW[((sel - 1) % 4) + 1] + ") = " + T(ang[sel - 1], 1) + "°</h3><ul class=\"ge-facts\"><li>" + L2.join("</li><li>") + "</li></ul><p style=\"margin-bottom:0;\">" + (st.par ? "Because the lines are parallel there are only two different sizes: <b>" + T(th, 1) + "°</b> and <b>" + T(180 - th, 1) + "°</b>. Turn on &ldquo;tilt&rdquo; by clearing <i>Lines are parallel</i> to see the rules break." : "The lower line is tilted " + eps + "° so the top four angles (" + T(th, 1) + "° / " + T(180 - th, 1) + "°) differ from the bottom four (" + T(th2, 1) + "° / " + T(180 - th2, 1) + "°). <b>Converse:</b> if corresponding (or alternate) angles are equal, the lines must be parallel.") + "</p>";
	}
	wireSvg($("ge-svg-lines"), function (h, p) { if (h !== "th") return; var cot0 = 0, th = Math.atan2(LY1 - p[1] + 0.0001, 0) ; var U0 = [320 + 80 * Math.cos(st.th * D2R) / Math.sin(st.th * D2R), LY1], v = Math.atan2(U0[1] - p[1], p[0] - U0[0]) / D2R; if (v < 0) v += 180; v = Math.max(25, Math.min(155, Math.round(v))); st.th = v; save(); syncLinesCtl(); rLines(); }, function (w) { st.sel = +w; save(); rLines(); });

	/* ================= CIRCLES ================= */
	var CM = [["insc", "Central & inscribed angle"], ["thales", "Thales (semicircle)"], ["quad", "Cyclic quadrilateral"], ["tang", "Tangent & chord"]], O = [320, 210], RR = 150;
	$("ge-circ-modes").innerHTML = CM.map(function (m) { return '<button type="button" class="tu-chip" data-m="' + m[0] + '">' + m[1] + "</button>"; }).join("");
	$("ge-circ-modes").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.cm = b.dataset.m; save(); rCircle(); });
	function onC(deg) { return pol(O, RR, deg); }
	function rCircle() {
		[].forEach.call($("ge-circ-modes").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.m === st.cm)); });
		var s = '<circle class="g-line" cx="' + O[0] + '" cy="' + O[1] + '" r="' + RR + '" style="fill:rgba(120,150,200,0.06)"/>', stats = "", facts = "", m = st.cm, A, B, P, ap, bp, pp;
		var dot = function (p, nm) { return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="3.5" fill="#2c3e55"/>' + text([p[0] + 14, p[1] - 8], nm, "g-ts"); };
		if (m === "insc" || m === "thales") {
			var aA = cp.a, aB = m === "thales" ? norm(cp.a + 180) : cp.b; A = onC(aA); B = onC(aB); P = onC(cp.p);
			var sw = norm(aB - aA), pp0 = norm(cp.p - aA), start, span; if (pp0 < sw) { start = aB; span = 360 - sw; } else { start = aA; span = sw; }
			s += wedge(O, 40, start, span, "", 'style="fill:#f2b01e;fill-opacity:0.35;stroke:#d97706;stroke-width:2"') + '<path d="' + arcPath(O, RR, start, span) + '" fill="none" stroke="#d97706" stroke-width="6" stroke-linecap="round" opacity="0.7"/>';
			s += line(O, A, "g-aux") + line(O, B, "g-aux") + dot(O, "O") + '<polygon class="g-tri" points="' + [A, P, B].map(pt).join(" ") + '" style="fill-opacity:0.2"/>';
			var inc = GE.angleDeg(A, P, B), va = vertexArc(P, A, B);
			if (Math.abs(inc - 90) < 0.6) { var u = pol([0, 0], 1, va.start), w = pol([0, 0], 1, va.start + 90), q = 20; s += '<polyline class="g-line" style="stroke:#3a6fd8" points="' + pt([P[0] + u[0] * q, P[1] + u[1] * q]) + " " + pt([P[0] + u[0] * q + w[0] * q, P[1] + u[1] * q + w[1] * q]) + " " + pt([P[0] + w[0] * q, P[1] + w[1] * q]) + '"/>'; } else s += wedge(P, 32, va.start, va.span, "", 'style="fill:#3a6fd8;fill-opacity:0.3;stroke:#3a6fd8;stroke-width:2"');
			s += text(pol(P, 56, va.mid), T(inc, 1) + "°", "g-ta", "fill:#3a6fd8") + text(pol(O, 62, start + span / 2), T(span, 1) + "°", "g-ta", "fill:#d97706");
			s += handle("a", A, "A") + (m === "thales" ? handle("a", B, "B") : handle("b", B, "B")) + handle("p", P, "P");
			stats = stat("Central angle AOB", T(span, 1) + "°", "on the arc that does not contain P") + stat("Inscribed angle APB", T(inc, 1) + "°", "at the circumference") + stat("Ratio", T(span / inc, 2), m === "thales" ? "AB is a diameter" : "always exactly 2");
			facts = m === "thales" ? '<h3 style="margin-top:0;">Thales\' theorem</h3><p>AB is a diameter, so the central angle is 180° and the angle in the semicircle is half of it: <b>∠APB = 90°</b> wherever P sits on the circle. Drag P and A to check. Conversely, a right triangle always fits in a circle whose diameter is its hypotenuse.</p>' : '<h3 style="margin-top:0;">Inscribed angle theorem</h3><p>The angle at the centre (<b>' + T(span, 1) + '°</b>) is twice the angle at the circumference (<b>' + T(inc, 1) + "°</b>) standing on the same arc AB. Move P along the circle: the angle at P does not change while P stays on the same side, because every inscribed angle on one arc is equal. When P crosses A or B, the arc flips and the angle becomes 180° − " + T(inc, 1) + "°.</p>";
		} else if (m === "quad") {
			var ids = [cp.a, cp.b, cp.p, cp.c], order = ids.map(function (v, i) { return [norm(v), i]; }).sort(function (x, y) { return x[0] - y[0]; }), pts = order.map(function (o) { return onC(o[0]); }), nm = ["A", "B", "C", "D"], ang = GE.cyclicQuad(pts);
			s += '<polygon class="g-tri" points="' + pts.map(pt).join(" ") + '" style="fill-opacity:0.35"/>';
			var cols = ["#d64545", "#2e9e5b", "#3a6fd8", "#e08a1e"];
			for (var i = 0; i < 4; i++) { var va2 = vertexArc(pts[i], pts[(i + 3) % 4], pts[(i + 1) % 4]); s += wedge(pts[i], 28, va2.start, va2.span, "", 'style="fill:' + cols[i] + ';fill-opacity:0.35;stroke:' + cols[i] + ';stroke-width:2"') + text(pol(pts[i], 50, va2.mid), T(ang[i], 1) + "°", "g-ta", "fill:" + cols[i]); }
			["a", "b", "p", "c"].forEach(function (k, j) { var idx = order.findIndex(function (o) { return o[1] === j; }); s += handle(k, pts[idx], nm[idx]); });
			stats = stat("∠A + ∠C", T(ang[0] + ang[2], 1) + "°", "opposite corners") + stat("∠B + ∠D", T(ang[1] + ang[3], 1) + "°", "opposite corners") + stat("All four", T(ang[0] + ang[1] + ang[2] + ang[3], 1) + "°", "any quadrilateral = 360°");
			facts = '<h3 style="margin-top:0;">Cyclic quadrilateral</h3><p>When all four corners lie on a circle, <b>opposite angles add to 180°</b>: ' + T(ang[0], 1) + "° + " + T(ang[2], 1) + "° = " + T(ang[0] + ang[2], 1) + "° and " + T(ang[1], 1) + "° + " + T(ang[3], 1) + "° = " + T(ang[1] + ang[3], 1) + "°. Reason: opposite angles stand on the two arcs that together make the whole circle (360°), and each is half its arc. The corners are renamed A–D in order around the circle.</p>";
		} else {
			A = onC(cp.a); B = onC(cp.b); P = onC(cp.p); var tc = GE.tangentChord(O, A, B), inc2 = GE.angleDeg(A, P, B), tx = -(A[1] - O[1]), ty = A[0] - O[0], tl = Math.hypot(tx, ty), T1 = [A[0] + tx / tl * 60, A[1] + ty / tl * 60], T2 = [A[0] - tx / tl * 60, A[1] - ty / tl * 60];
			var Tm = Math.abs(GE.angleDeg(B, A, T1) - inc2) < Math.abs(GE.angleDeg(B, A, T2) - inc2) ? T1 : T2, Ts = Tm === T1 ? T2 : T1, ta = GE.angleDeg(B, A, Tm), vt = vertexArc(A, B, Tm), vp = vertexArc(P, A, B);
			s += line([A[0] + tx / tl * 220, A[1] + ty / tl * 220], [A[0] - tx / tl * 220, A[1] - ty / tl * 220], "g-line") + line(A, B, "g-line") + line(P, A, "g-aux") + line(P, B, "g-aux") + dot(O, "O") + line(O, A, "g-aux");
			s += wedge(A, 40, vt.start, vt.span, "", 'style="fill:#d97706;fill-opacity:0.4;stroke:#d97706;stroke-width:2"') + text(pol(A, 66, vt.mid), T(ta, 1) + "°", "g-ta", "fill:#d97706") + wedge(P, 32, vp.start, vp.span, "", 'style="fill:#3a6fd8;fill-opacity:0.3;stroke:#3a6fd8;stroke-width:2"') + text(pol(P, 56, vp.mid), T(inc2, 1) + "°", "g-ta", "fill:#3a6fd8");
			s += handle("a", A, "A") + handle("b", B, "B") + handle("p", P, "P");
			stats = stat("Tangent–chord angle", T(ta, 1) + "°", "between the tangent at A and chord AB") + stat("Angle in alternate segment", T(inc2, 1) + "°", "∠APB, P on the far side") + stat("Arc AB / 2", T(tc.arcAB / 2, 1) + "°", "half the central angle (minor arc)");
			facts = '<h3 style="margin-top:0;">Tangent–chord (alternate segment) theorem</h3><p>The angle between a tangent and a chord equals the inscribed angle in the alternate segment: <b>' + T(ta, 1) + "° = " + T(inc2, 1) + "°</b>. Both are half of the arc AB between them. The tangent at A is always at 90° to the radius OA, which is why the proof works.</p>";
		}
		put($("ge-svg-circle"), s); $("ge-circ-stats").innerHTML = stats; $("ge-circ-facts").innerHTML = facts;
	}
	wireSvg($("ge-svg-circle"), function (h, p) { var d = Math.round(norm(Math.atan2(O[1] - p[1], p[0] - O[0]) / D2R)); cp[h] = d; rCircle(); });

	/* ================= ANGLES & POLYGONS ================= */
	var AV = [60, 230], AR = 200, ACOL = { zero: "#9aa5b4", acute: "#2e9e5b", right: "#3a6fd8", obtuse: "#e08a1e", straight: "#7b8794", reflex: "#8e55c7", full: "#9aa5b4" };
	function frac(deg) { if (Math.abs(deg - Math.round(deg)) > 1e-9) return ""; var d = Math.round(deg), g = (function gcd(a, b) { return b ? gcd(b, a % b) : a; })(d, 180); if (d === 0) return "0"; var n = d / g, m = 180 / g; return (n === 1 ? "" : n) + "π" + (m === 1 ? "" : "/" + m); }
	function rAng() {
		var a = st.ang, cls = GE.classifyAngle(a), col = ACOL[cls], s = "", V = AV, tip = pol(V, AR, a), end0 = [V[0] + AR, V[1]];
		for (var r = 40; r <= 200; r += 40) s += '<circle class="g-thin" cx="' + V[0] + '" cy="' + V[1] + '" r="' + r + '" style="stroke-dasharray:2 4"/>';
		s += line(V, end0, "g-line"); if (a > 0 && a < 360) s += wedge(V, 52, 0, a, "", 'style="fill:' + col + ';fill-opacity:0.3;stroke:' + col + ';stroke-width:2.5"');
		if (cls === "right") s += '<polyline class="g-line" style="stroke:' + col + '" points="' + pt([V[0] + 22, V[1]]) + " " + pt([V[0] + 22, V[1] - 22]) + " " + pt([V[0], V[1] - 22]) + '"/>';
		s += line(V, tip, "g-line") + text(pol(V, 78, a / 2 || 12), T(a, 1) + "°", "g-ta", "fill:" + col) + handle("ang", tip, "", col); put($("ge-svg-ang"), s);
		var cm = GE.complement(a), sp = GE.supplement(a), fr = frac(a);
		$("ge-ang-stats").innerHTML = stat("Type", '<span class="ge-badge" style="background:' + col + ';color:#fff">' + cls + "</span>", GE.ANGLE_INFO[cls]) + stat("Complement", cm == null ? "none" : T(cm, 2) + "°", "adds to 90° (only for angles up to 90°)") + stat("Supplement", sp == null ? "none" : T(sp, 2) + "°", "adds to 180° (up to 180°)") + stat("Conjugate", T(GE.conjugate(a), 2) + "°", "adds to 360°") + stat("Radians", T(GE.toRad(a), 4) + " rad", fr ? "= " + fr + " rad" : "") + stat("Gradians · turns", T(GE.toGrad(a), 2) + " grad", T(a / 360, 4) + " of a full turn");
	}
	function setAng(v, noInput) { v = Math.max(0, Math.min(360, v)); if (st.snap15) v = Math.round(v / 15) * 15; st.ang = Math.round(v * 100) / 100; if (!noInput) $("ge-ang").value = T(st.ang, 2); save(); rAng(); }
	$("ge-ang").addEventListener("input", function () { var v = parseFloat(this.value.replace(",", ".")); if (isFinite(v)) { st.ang = Math.max(0, Math.min(360, v)); save(); rAng(); } });
	$("ge-snap").addEventListener("change", function () { st.snap15 = this.checked; save(); });
	wireSvg($("ge-svg-ang"), function (h, p) { var v = Math.atan2(AV[1] - p[1], p[0] - AV[0]) / D2R; if (v < 0) v += 360; var old = st.ang; if (old > 300 && v < 60) v = 360; else if (old < 60 && v > 300) v = 0; setAng(v); });
	// polygon
	var PC = [160, 150], PRAD = 105;
	function regularPts(n) { var p = []; for (var i = 0; i < n; i++) p.push(pol(PC, PRAD, 90 + i * 360 / n)); return p; }
	function rPoly() {
		var n = st.n; if (!poly || poly.length !== n || !st.free) { if (!poly || poly.length !== n || !st.free) poly = regularPts(n); }
		var P = poly, ang = GE.polygonAngles(P), s = "", i, rp = GE.regularPolygon(n), cols = ["#d64545", "#2e9e5b", "#3a6fd8", "#e08a1e", "#8e55c7", "#16a3a3"];
		s += '<polygon class="g-tri" points="' + P.map(pt).join(" ") + '"/>';
		if (!st.free) for (i = 2; i < n - 1; i++) s += line(P[0], P[i], "g-aux");
		var area = 0; for (i = 0; i < n; i++) { var q = P[(i + 1) % n]; area += P[i][0] * q[1] - q[0] * P[i][1]; } var sg = area >= 0 ? 1 : -1;
		for (i = 0; i < n; i++) {
			var prv = P[(i + n - 1) % n], nx = P[(i + 1) % n], va = vertexArc(P[i], prv, nx), reflex = ang[i] > 180.01, st0 = va.start, sp = va.span; if (reflex) { st0 = va.start + va.span; sp = 360 - va.span; }
			var rad = n > 9 ? 14 : 20; s += wedge(P[i], rad, st0, sp, "", 'style="fill:' + cols[i % 6] + ';fill-opacity:0.35;stroke:' + cols[i % 6] + ';stroke-width:1.5"');
			if (n <= 8 || st.free && n <= 10) s += text(pol(P[i], rad + 17, st0 + sp / 2), T(ang[i], 0) + "°", "g-ts", "font-weight:700;fill:" + cols[i % 6]);
			if (st.ext) { var d1 = dir(prv, P[i]), ex = pol(P[i], 38, d1); s += line(P[i], ex, "g-aux"); var tn = ((dir(P[i], nx) - d1 + 540) % 360) - 180; s += '<path d="' + arcPath(P[i], 26, tn > 0 ? d1 : d1 + tn, Math.abs(tn)) + '" fill="none" stroke="#d64545" stroke-width="2"/>'; }
		}
		if (st.free) for (i = 0; i < n; i++) s += handle("p" + i, P[i], String(i + 1), cols[i % 6]); put($("ge-svg-poly"), s);
		var sum = ang.reduce(function (a, b) { return a + b; }, 0), reg = !st.free;
		$("ge-poly-stats").innerHTML = stat("Sides n", n, n === 3 ? "triangle" : n === 4 ? "quadrilateral" : n === 5 ? "pentagon" : n === 6 ? "hexagon" : n === 7 ? "heptagon" : n === 8 ? "octagon" : n === 9 ? "nonagon" : n === 10 ? "decagon" : "") + stat("Interior angle sum", T(sum, 1) + "°", "(n − 2) × 180° = " + rp.sum + "°") + stat(reg ? "Each interior angle" : "Your angles", reg ? T(rp.interior, 2) + "°" : ang.map(function (v) { return T(v, 0); }).join("°, ") + "°", reg ? "(n − 2) × 180° ÷ n" : "") + stat("Each exterior angle", reg ? T(rp.exterior, 2) + "°" : "—", "360° ÷ n; they always add to 360°") + stat("Diagonals", rp.diagonals, "n(n − 3) ÷ 2") + stat("Triangles inside", rp.triangles, "split from one corner: n − 2");
		$("ge-poly-facts").innerHTML = '<h3 style="margin-top:0;">Why the angles add up</h3><ul class="ge-facts"><li>Draw diagonals from one corner to cut the polygon into <b>n − 2 = ' + rp.triangles + "</b> triangles. Each triangle has 180°, so the interior angles add to <b>" + rp.triangles + " × 180° = " + rp.sum + "°</b>.</li><li>At every corner, interior + exterior = 180°, so the exterior angles add to n × 180° − (n − 2) × 180° = <b>360°</b>: one full turn if you walk round the shape.</li>" + (reg ? "<li>All " + n + " angles are equal in a regular polygon, so each is " + rp.sum + "° ÷ " + n + " = <b>" + T(rp.interior, 2) + "°</b>.</li>" : "<li>Your polygon's angles add to " + T(sum, 1) + "° (" + (Math.abs(sum - rp.sum) < 0.5 ? '<span class="ge-ok">matches</span>' : '<span class="ge-bad">does not match: the sides cross each other, so it is not a simple polygon</span>') + "). A corner bent inward is a reflex angle, bigger than 180°.</li>") + "</ul>";
	}
	function syncPolyCtl() { $("ge-n").value = st.n; $("ge-no").textContent = st.n; $("ge-free").checked = st.free; $("ge-ext").checked = st.ext; $("ge-snap").checked = st.snap15; $("ge-ang").value = T(st.ang, 2); }
	$("ge-n").addEventListener("input", function () { st.n = +this.value; poly = null; save(); syncPolyCtl(); rPoly(); });
	$("ge-free").addEventListener("change", function () { st.free = this.checked; poly = null; save(); rPoly(); });
	$("ge-ext").addEventListener("change", function () { st.ext = this.checked; save(); rPoly(); });
	wireSvg($("ge-svg-poly"), function (h, p) { var i = +h.slice(1); poly[i] = [Math.max(10, Math.min(310, p[0])), Math.max(10, Math.min(290, p[1]))]; rPoly(); });

	/* ================= tabs ================= */
	function show(tab) {
		st.tab = tab; save(); [].forEach.call($("ge-tabs").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.t === tab)); b.setAttribute("aria-selected", String(b.dataset.t === tab)); });
		[].forEach.call(root.querySelectorAll("section[data-p]"), function (s) { s.hidden = s.dataset.p !== tab; });
		if (tab === "tri") { syncTriCtl(); rTri(); } else if (tab === "lines") { syncLinesCtl(); rLines(); } else if (tab === "circle") rCircle(); else { syncPolyCtl(); rAng(); rPoly(); }
	}
	$("ge-tabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { show(b.dataset.t); try { history.replaceState(null, "", "?tab=" + b.dataset.t); } catch (x) {} } });
	load(); var q = new URLSearchParams(location.search).get("tab"); if (q && /^(tri|lines|circle|poly)$/.test(q)) st.tab = q;
	setPreset(GE.PRESETS[st.pre] ? st.pre : "scalene"); show(st.tab);
})();
