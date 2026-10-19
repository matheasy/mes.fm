/* MES Trigonometry Calculator -- mes.fm/trigonometry (UI; maths in lib.js, global TR). localStorage "mes-trigonometry:v1". Links: ?tab=circle|calc|tri|graph|tables&a=45 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("tg"); if (!root || !window.TR) return;
	var KEY = "mes-trigonometry:v1", T = TR.trim, R = Math.PI / 180;
	var st = { tab: "circle", ang: 45, cu: "deg", snap: false, rec: false, aDeg: 30, ifn: "sin", iv: "0.5", tmode: "right", fn: "sin", g: { A: 1, B: 1, C: 0, D: 0 }, par: true, tr: 15, ts: 360, td: 4, tx: true, lab: {}, tpos: {}, tsz: 1, id: "pyth", ix: "25", iy: "40" }, ts = {};
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) Object.keys(st).forEach(function (k) { if (s[k] != null && typeof s[k] === typeof st[k]) st[k] = s[k]; }); if (s && s.tpos && typeof s.tpos === "object") { st.tpos = {}; Object.keys(s.tpos).forEach(function (k) { var v = s.tpos[k]; if (Array.isArray(v) && Math.abs(v[0]) <= 120 && Math.abs(v[1]) <= 60) st.tpos[k] = v; }); } if (s && typeof s.tsz === "number" && s.tsz > 1.3) st.tsz = 1; if (s && s.g && typeof s.g === "object") ["A", "B", "C", "D"].forEach(function (k) { if (typeof s.g[k] === "number") st.g[k] = s.g[k]; }); } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function stat(l, v, s, c) { return '<div class="tu-stat' + (c ? " " + c : "") + '"><div class="tu-stat__label">' + l + '</div><div class="tu-stat__value">' + v + '</div><div class="tu-stat__sub">' + (s || "") + "</div></div>"; }
	function num(v, d) { return v == null ? "undefined" : T(v, d == null ? 6 : d); }
	function parseVal(str) {
		var t = String(str || "").toLowerCase().replace(/,/g, ".").replace(/π/g, "pi").replace(/√\(/g, "sqrt(").replace(/√\s*(\d+(\.\d+)?)/g, "sqrt($1)").replace(/\s+/g, ""); if (!t || !/^[0-9a-z+\-*\/().]+$/.test(t)) return null;
		var chk = t.replace(/sqrt/g, "").replace(/pi/g, ""); if (/[a-z]/.test(chk)) return null; t = t.replace(/(\d|\))(sqrt|pi|\()/g, "$1*$2").replace(/(pi)(\d|\()/g, "$1*$2").replace(/sqrt/g, "Math.sqrt").replace(/pi/g, "Math.PI");
		try { var v = Function('"use strict";return (' + t + ")")(); return typeof v === "number" && isFinite(v) ? v : null; } catch (e) { return null; }
	}
	function lbPost(prefix, html) { var n = 0; return html.replace(/<text ([^>]*)>/g, function (m, attrs) { var id = prefix + ":" + n++, o = st.lab[id]; return '<text data-lb="' + id + '" ' + (o ? 'transform="translate(' + o[0].toFixed(1) + "," + o[1].toFixed(1) + ')" ' : "") + attrs + ">"; }); }
	var LD = null;
	var TM = null;
	document.addEventListener("pointerdown", function (e) { var tm = e.target.closest && e.target.closest("[data-tm]"), tl = e.target.closest && e.target.closest("[data-lb]"); if (tm && !tl && root.contains(tm)) { var sv = tm.ownerSVGElement, q = svgPoint(sv, e); TM = { id: "tri" + tm.dataset.tm, idx: [].indexOf.call(root.querySelectorAll("svg"), sv), last: [q.x, q.y] }; e.preventDefault(); return; } var t = e.target.closest && e.target.closest("[data-lb]"); if (!t || !root.contains(t) || !t.ownerSVGElement) return; var svg = t.ownerSVGElement, p = svgPoint(svg, e); LD = { id: t.dataset.lb, idx: [].indexOf.call(root.querySelectorAll("svg"), svg), last: [p.x, p.y] }; e.preventDefault(); }, true);
	document.addEventListener("pointermove", function (e) { if (TM) { var sv2 = root.querySelectorAll("svg")[TM.idx]; if (!sv2) return; var q2 = svgPoint(sv2, e), o2 = st.tpos[TM.id] || [0, 0]; st.tpos[TM.id] = [Math.max(-120, Math.min(120, o2[0] + q2.x - TM.last[0])), Math.max(-60, Math.min(60, o2[1] + q2.y - TM.last[1]))]; TM.last = [q2.x, q2.y]; rTri(); return; } if (!LD) return; var svg = root.querySelectorAll("svg")[LD.idx]; if (!svg) return; var p = svgPoint(svg, e), o = st.lab[LD.id] || [0, 0]; st.lab[LD.id] = [o[0] + p.x - LD.last[0], o[1] + p.y - LD.last[1]]; LD.last = [p.x, p.y]; if (st.tab === "tri") rTri(); else rCircle(); });
	var ldEnd = function () { if (LD || TM) { LD = null; TM = null; save(); } }; document.addEventListener("pointerup", ldEnd); document.addEventListener("pointercancel", ldEnd);
	function toast(msg) { var t = $("tg-toast"); if (!t) { t = document.createElement("div"); t.id = "tg-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1600); }
	function svgPoint(svg, e) { var p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; var m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; }
	function fmtU(deg, u) { return u === "rad" ? T(deg * R, 4) + " rad" : T(deg, 2) + "°"; }

	/* ================= UNIT CIRCLE ================= */
	var C0 = [250, 200], RC = 140, FN = { sin: "#d64545", cos: "#2f6fd0", tan: "#1f9a56", csc: "#8e55c7", sec: "#e08a1e", cot: "#16a3a3" };
	var PRE = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360];
	function setAngle(d, fromInput) {
		d = Math.max(-1440, Math.min(1440, d)); if (st.snap) d = Math.round(d / 15) * 15; st.ang = Math.round(d * 1e4) / 1e4; save();
		if (!fromInput) cFields(); rCircle();
	}
	$("tg-c-pre").innerHTML = PRE.map(function (d) { return '<button type="button" class="tu-chip" data-d="' + d + '">' + d + "°</button>"; }).join("");
	$("tg-c-pre").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) setAngle(+b.dataset.d); });
	function radText(d) { return TR.piFraction(d) || T(d * R, 6); }
	function cFields(except) { if (except !== "deg") $("tg-c-deg").value = T(st.ang, 4); if (except !== "rad") $("tg-c-rad").value = radText(st.ang); }
	$("tg-c-deg").addEventListener("input", function () { var v = TR.parseAngle(this.value, "deg"); if (v != null) { st.ang = Math.round(v * 1e6) / 1e6; save(); cFields("deg"); rCircle(); } });
	$("tg-c-rad").addEventListener("input", function () { var v = TR.parseAngle(this.value, "rad"); if (v != null) { st.ang = Math.round(v * 1e6) / 1e6; save(); cFields("rad"); rCircle(); } });
	$("tg-c-snap").addEventListener("change", function () { st.snap = this.checked; save(); if (st.snap) setAngle(st.ang); });
	$("tg-c-rec").addEventListener("change", function () { st.rec = this.checked; save(); rCircle(); });
	function syncC() { cFields(); $("tg-c-snap").checked = st.snap; $("tg-c-rec").checked = st.rec; }
	function cl(v) { return Math.max(-9999, Math.min(9999, v)); }
	function rCircle() {
		var d = st.ang, t = TR.trig(d), r = d * R, cx = C0[0], cy = C0[1], px = cx + RC * Math.cos(r), py = cy - RC * Math.sin(r), s = "", i;
		for (i = -1; i <= 1; i += 0.5) { s += '<line class="t-gr" x1="' + (cx + i * RC) + '" y1="20" x2="' + (cx + i * RC) + '" y2="380"/><line class="t-gr" x1="' + (cx - 190) + '" y1="' + (cy + i * RC) + '" x2="' + (cx + 190) + '" y2="' + (cy + i * RC) + '"/>'; }
		s += '<line class="t-ax" x1="' + (cx - 195) + '" y1="' + cy + '" x2="' + (cx + 195) + '" y2="' + cy + '"/><line class="t-ax" x1="' + cx + '" y1="12" x2="' + cx + '" y2="388"/><circle class="t-cir" cx="' + cx + '" cy="' + cy + '" r="' + RC + '"/>';
		s += '<text class="t-tx" x="' + (cx + RC + 4) + '" y="' + (cy + 14) + '">1</text><text class="t-tx" x="' + (cx - RC - 14) + '" y="' + (cy + 14) + '">−1</text><text class="t-tx" x="' + (cx + 6) + '" y="' + (cy - RC - 4) + '">1</text><text class="t-tx" x="' + (cx + 6) + '" y="' + (cy + RC + 12) + '">−1</text>';
		// tangent line at (1,0)
		s += '<line class="t-ax" x1="' + (cx + RC) + '" y1="12" x2="' + (cx + RC) + '" y2="388" style="stroke-dasharray:4 4"/>';
		var arcR = 36, a0 = 0, sp = ((d % 360) + 360) % 360; if (d < 0) { sp = -(((-d) % 360)); }
		var spa = d, endx = cx + arcR * Math.cos(r), endy = cy - arcR * Math.sin(r), big = Math.abs(spa % 360) > 180 ? 1 : 0, sweep = spa >= 0 ? 0 : 1; if (Math.abs(spa) >= 360) { s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + arcR + '" fill="none" stroke="#e08a1e" stroke-width="2.5" stroke-dasharray="3 3"/>'; } else s += '<path d="M' + (cx + arcR) + "," + cy + " A" + arcR + "," + arcR + " 0 " + big + " " + sweep + " " + endx.toFixed(1) + "," + endy.toFixed(1) + '" fill="none" stroke="#e08a1e" stroke-width="3"/>';
		s += '<text class="t-tx" style="fill:#e08a1e;font-weight:700" x="' + (cx + 50 * Math.cos(r / 2)) + '" y="' + (cy - 50 * Math.sin(r / 2) + 4) + '" text-anchor="middle">θ</text>';
		s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + px + '" y2="' + py + '" stroke="#2c3e55" stroke-width="2.4"/>';
		s += '<line class="t-ln" style="stroke:' + FN.cos + '" x1="' + cx + '" y1="' + cy + '" x2="' + px + '" y2="' + cy + '"/><line class="t-ln" style="stroke:' + FN.sin + '" x1="' + px + '" y1="' + cy + '" x2="' + px + '" y2="' + py + '"/>';
		if (t.tan != null) { var ty = cy - RC * Math.max(-3, Math.min(3, t.tan)); s += '<line class="t-ln" style="stroke:' + FN.tan + '" x1="' + (cx + RC) + '" y1="' + cy + '" x2="' + (cx + RC) + '" y2="' + ty + '"/><line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + RC) + '" y2="' + (cy - RC * t.tan) + '" stroke="' + FN.tan + '" stroke-width="1.4" stroke-dasharray="4 4" opacity="0.7"/>'; }
		if (st.rec) {
			if (t.sec != null) s += '<line class="t-ln" style="stroke:' + FN.sec + ';stroke-width:2.4" x1="' + cx + '" y1="' + cy + '" x2="' + (cx + RC * Math.max(-3, Math.min(3, t.sec))) + '" y2="' + cy + '" opacity="0.85"/>';
			if (t.csc != null) s += '<line class="t-ln" style="stroke:' + FN.csc + ';stroke-width:2.4" x1="' + cx + '" y1="' + cy + '" x2="' + cx + '" y2="' + (cy - RC * Math.max(-3, Math.min(3, t.csc))) + '" opacity="0.85"/>';
			if (t.cot != null) s += '<line class="t-ln" style="stroke:' + FN.cot + ';stroke-width:2.4" x1="' + cx + '" y1="' + (cy - RC) + '" x2="' + (cx + RC * Math.max(-3, Math.min(3, t.cot))) + '" y2="' + (cy - RC) + '" opacity="0.85"/>';
		}
		s += '<circle class="t-h" data-h="1" tabindex="0" role="slider" aria-label="Angle point" aria-valuenow="' + T(d, 1) + '" cx="' + px + '" cy="' + py + '" r="11"/>';
		var ly = 34; [["sin", t.sin], ["cos", t.cos], ["tan", t.tan]].concat(st.rec ? [["csc", t.csc], ["sec", t.sec], ["cot", t.cot]] : []).forEach(function (f) { s += '<text class="t-lb" x="470" y="' + ly + '" style="fill:' + FN[f[0]] + '">' + f[0] + " θ = " + num(f[1], 4) + "</text>"; ly += 26; });
		s += '<text class="t-lb" x="470" y="' + (ly + 10) + '" style="fill:#e08a1e">θ = ' + T(d, 2) + "°</text>" + '<text class="t-tx" x="470" y="' + (ly + 30) + '">= ' + T(d * R, 4) + " rad" + (TR.piFraction(d) ? " = " + TR.piFraction(d) : "") + "</text>";
		var h = $("tg-svg-c"); var had = document.activeElement && h.contains(document.activeElement); h.innerHTML = lbPost("circ", s); if (had) h.querySelector("[data-h]").focus({ preventScroll: true });
		// wave strip
		var w = "", W0 = 44, W1 = 620, YM = 95, YA = 70, X = function (dd) { return W0 + (((dd % 360) + 360) % 360) / 360 * (W1 - W0); };
		for (i = 0; i <= 4; i++) { var xx = W0 + i * (W1 - W0) / 4; w += '<line class="t-gr" x1="' + xx + '" y1="14" x2="' + xx + '" y2="176"/><text class="t-tx" x="' + xx + '" y="188" text-anchor="middle">' + i * 90 + "°</text>"; }
		w += '<line class="t-ax" x1="' + W0 + '" y1="' + YM + '" x2="' + W1 + '" y2="' + YM + '"/>'; ["sin", "cos"].forEach(function (f) { var p = []; for (var q = 0; q <= 360; q += 3) p.push((W0 + q / 360 * (W1 - W0)).toFixed(1) + "," + (YM - YA * (f === "sin" ? Math.sin(q * R) : Math.cos(q * R))).toFixed(1)); w += '<polyline points="' + p.join(" ") + '" fill="none" stroke="' + FN[f] + '" stroke-width="2.6"/>'; });
		var mx = X(d); w += '<line x1="' + mx + '" y1="14" x2="' + mx + '" y2="176" stroke="#e08a1e" stroke-width="2" stroke-dasharray="4 3"/><circle cx="' + mx + '" cy="' + (YM - YA * t.sin) + '" r="5.5" fill="' + FN.sin + '"/><circle cx="' + mx + '" cy="' + (YM - YA * t.cos) + '" r="5.5" fill="' + FN.cos + '"/><text class="t-tx" x="50" y="20" style="fill:' + FN.sin + ';font-weight:700">sin</text><text class="t-tx" x="78" y="20" style="fill:' + FN.cos + ';font-weight:700">cos</text><text class="t-tx" x="' + (W0 - 6) + '" y="' + (YM - YA + 4) + '" text-anchor="end">1</text><text class="t-tx" x="' + (W0 - 6) + '" y="' + (YM + YA + 4) + '" text-anchor="end">−1</text>';
		$("tg-svg-w").innerHTML = w;
		var ex = TR.exact(d), q = TR.quadrant(d), ref = TR.referenceAngle(d), qn = q ? "Quadrant " + ["I", "II", "III", "IV"][q - 1] : "On an axis";
		var sg = q ? { 1: "all positive", 2: "only sin positive", 3: "only tan positive", 4: "only cos positive" }[q] : "";
		$("tg-c-stats").innerHTML = stat("sin θ", num(t.sin, 6), ex ? "= " + esc(ex.sin) : "", "tu-stat--hero") + stat("cos θ", num(t.cos, 6), ex ? "= " + esc(ex.cos) : "", "tu-stat--hero") + stat("tan θ", num(t.tan, 6), ex && ex.tan ? "= " + esc(ex.tan) : t.tan == null ? "vertical line: no value" : "") + stat("csc θ", num(t.csc, 6), "1 / sin θ") + stat("sec θ", num(t.sec, 6), "1 / cos θ") + stat("cot θ", num(t.cot, 6), "1 / tan θ") + stat("Quadrant", qn, sg) + stat("Reference angle", T(ref, 3) + "°", "the acute angle to the x-axis");
		var cf = []; cf.push("<b>Pythagoras on the unit circle:</b> sin²θ + cos²θ = " + T(t.sin * t.sin, 4) + " + " + T(t.cos * t.cos, 4) + " = <span class=\"tg-ok\">" + T(t.sin * t.sin + t.cos * t.cos, 6) + "</span>.");
		if (q) cf.push("<b>Reading the sign (ASTC):</b> in quadrant " + ["I", "II", "III", "IV"][q - 1] + ", " + sg + ". Reference angle " + T(ref, 3) + "°, so |sin θ| = sin " + T(ref, 3) + "° = " + T(Math.sin(ref * R), 6) + " and |cos θ| = " + T(Math.cos(ref * R), 6) + ".");
		if (Math.abs(d) >= 360 || d < 0) cf.push("<b>Coterminal angle:</b> " + T(d, 3) + "° points the same way as " + T(TR.norm360(d), 3) + "° (add or subtract full turns of 360°), so every function value is the same.");
		if (t.tan != null) cf.push("<b>tan θ = sin θ ÷ cos θ</b> = " + T(t.sin, 4) + " ÷ " + T(t.cos, 4) + " = " + T(t.tan, 5) + ": the slope of the radius, and the length cut off on the tangent line at x = 1.");
		$("tg-c-facts").innerHTML = '<h3 style="margin-top:0;">What is going on?</h3><ul style="margin:0;padding-left:1.2em;line-height:1.55;"><li>' + cf.join("</li><li>") + "</li></ul>";
	}
	(function () {
		var svg = $("tg-svg-c"), on = false;
		svg.addEventListener("pointerdown", function (e) { if (e.target.closest("[data-h]")) { on = true; try { svg.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); } });
		svg.addEventListener("pointermove", function (e) { if (!on) return; var p = svgPoint(svg, e), a = Math.atan2(C0[1] - p.y, p.x - C0[0]) / R; if (a < 0) a += 360; var old = ((st.ang % 360) + 360) % 360, base = st.ang - old, dl = a - old; if (dl > 180) dl -= 360; else if (dl < -180) dl += 360; setAngle(st.ang + dl); });
		var end = function () { on = false; }; svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
		svg.addEventListener("keydown", function (e) { var dd = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key]; if (!dd) return; e.preventDefault(); setAngle(st.ang + dd * (e.shiftKey ? 15 : 1)); });
	})();

	/* ================= CALCULATOR ================= */
	function aFields(except) { if (except !== "deg") $("tg-a-deg").value = T(st.aDeg, 6); if (except !== "rad") $("tg-a-rad").value = radText(st.aDeg); if (except !== "grad") $("tg-a-grad").value = T(st.aDeg / 0.9, 6); }
	function rCalc() {
		var d = st.aDeg, tab = $("tg-a-tab"), note = $("tg-a-note");
		if (d == null || !isFinite(d)) { tab.innerHTML = ""; note.textContent = "Enter an angle in any box."; return; }
		var t = TR.trig(d), ex = TR.exact(d), rows = [["sin", t.sin, ex && ex.sin, ""], ["cos", t.cos, ex && ex.cos, ""], ["tan", t.tan, ex && ex.tan, ""], ["csc", t.csc, null, "1 / sin"], ["sec", t.sec, null, "1 / cos"], ["cot", t.cot, null, "1 / tan"]];
		tab.innerHTML = "<thead><tr><th>Function</th><th>Value</th><th>Exact</th></tr></thead><tbody>" + rows.map(function (r) { return "<tr><td><b>" + r[0] + "</b> " + T(d, 4) + "°</td><td>" + (r[1] == null ? "undefined" : esc(T(r[1], 10))) + "</td><td>" + (r[2] ? esc(r[2]) : r[3] ? esc(r[3]) : "") + "</td></tr>"; }).join("") + "</tbody>";
		note.innerHTML = "Angle: <b>" + T(d, 6) + "°</b> = <b>" + T(d * R, 8) + " rad</b>" + (TR.piFraction(d) ? " = " + TR.piFraction(d) : "") + " = " + T(d / 0.9, 5) + " grad. Quadrant " + (TR.quadrant(d) ? ["I", "II", "III", "IV"][TR.quadrant(d) - 1] : "boundary") + ", reference angle " + T(TR.referenceAngle(d), 4) + "°.";
	}
	[["deg", "deg"], ["rad", "rad"], ["grad", "grad"]].forEach(function (u) { $("tg-a-" + u[0]).addEventListener("input", function () { var v = TR.parseAngle(this.value, u[1]); if (v != null) { st.aDeg = v; save(); aFields(u[0]); rCalc(); } else if (!this.value.trim()) { $("tg-a-tab").innerHTML = ""; $("tg-a-note").textContent = "Enter an angle in any box."; } }); });
	function rInv() {
		var v = parseVal($("tg-i-v").value), fn = $("tg-i-fn").value, out = $("tg-i-out"); st.ifn = fn; st.iv = $("tg-i-v").value; save();
		if (v == null) { out.innerHTML = $("tg-i-v").value.trim() ? '<span class="tg-bad">Could not read that value.</span>' : ""; return; }
		var r = TR.inverse(fn, v); if (!r) { out.innerHTML = '<span class="tg-bad">No angle has ' + fn + " = " + esc(T(v, 6)) + "</span>" + (fn === "sin" || fn === "cos" ? ": sin and cos only take values from −1 to 1." : fn === "csc" || fn === "sec" ? ": csc and sec are never between −1 and 1." : "."); return; }
		out.innerHTML = fn + "⁻¹(" + esc(T(v, 6)) + ") <b>= " + esc(T(r.principal, 6)) + "°</b> = " + T(r.principal * R, 6) + " rad (principal value).<br>Every solution from 0° to 360°: <b>" + r.solutions.map(function (x) { return T(x, 6) + "°"; }).join(", ") + "</b>.<br>All solutions: <b>" + esc(r.general.replace(/x/g, "θ")) + "</b> where k is any whole number.";
	}
	$("tg-i-fn").addEventListener("change", rInv); $("tg-i-v").addEventListener("input", rInv);

	/* ================= TRIANGLES ================= */
	var FIELDS = { right: [["a", "a (opposite A)"], ["b", "b (adjacent to A)"], ["c", "c (hypotenuse)"], ["A", "Angle A (°)"], ["B", "Angle B (°)"]], any: [["a", "side a"], ["b", "side b"], ["c", "side c"], ["A", "Angle A (°)"], ["B", "Angle B (°)"], ["C", "Angle C (°)"]] };
	var EX = [["Right: legs 3 & 4", "right", { a: "3", b: "4" }], ["Right: hypotenuse 13, A = 30°", "right", { c: "13", A: "30" }], ["SSS: 7, 8, 9", "any", { a: "7", b: "8", c: "9" }], ["SAS: b 5, c 7, A 49°", "any", { b: "5", c: "7", A: "49" }], ["ASA: A 40°, B 60°, c 10", "any", { A: "40", B: "60", c: "10" }], ["SSA (two triangles): a 6, b 8, A 30°", "any", { a: "6", b: "8", A: "30" }]];
	$("tg-t-ex").innerHTML = EX.map(function (x, i) { return '<button type="button" class="tu-chip" data-i="' + i + '">' + esc(x[0]) + "</button>"; }).join("");
	$("tg-t-ex").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var x = EX[+b.dataset.i]; st.tmode = x[1]; ts = Object.assign({}, x[2]); save(); buildT(); rTri(); });
	$("tg-t-mode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.tmode = b.dataset.m; ts = {}; save(); buildT(); rTri(); });
	$("tg-t-clear").addEventListener("click", function () { ts = {}; buildT(); rTri(); });
	$("tg-t-labreset").addEventListener("click", function () { st.lab = {}; st.tpos = {}; st.tsz = 1; $("tg-tsz").value = 1; $("tg-tszo").textContent = "100%"; save(); rTri(); }); $("tg-tsz").addEventListener("input", function () { st.tsz = +this.value; $("tg-tszo").textContent = Math.round(st.tsz * 100) + "%"; save(); rTri(); }); $("tg-c-labreset").addEventListener("click", function () { st.lab = {}; save(); rCircle(); });
	function buildT() {
		$("tg-tsz").value = st.tsz; $("tg-tszo").textContent = Math.round(st.tsz * 100) + "%";
		[].forEach.call($("tg-t-mode").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.m === st.tmode)); });
		$("tg-t-help").innerHTML = st.tmode === "right" ? "C is the right angle (90°). Fill in <b>any two</b> values (at least one side); the rest is worked out." : "Fill in <b>any three</b> values, at least one a side. Side a is opposite angle A, and so on.";
		$("tg-t-fields").innerHTML = FIELDS[st.tmode].map(function (f) { return '<div class="tu-field"><label for="tg-t-' + f[0] + '">' + esc(f[1]) + '</label><input id="tg-t-' + f[0] + '" data-k="' + f[0] + '" class="tu-input" type="text" inputmode="decimal" autocomplete="off" value="' + esc(ts[f[0]] || "") + '"></div>'; }).join("");
	}
	$("tg-t-fields").addEventListener("input", function (e) { var k = e.target.dataset.k; if (k) { ts[k] = e.target.value; rTri(); } });
	function figure(s, si) {
		var A = [0, 0], B = [s.c, 0], C = [s.b * Math.cos(s.A * R), s.b * Math.sin(s.A * R)], xs = [A[0], B[0], C[0]], x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), h = C[1], k = Math.min(280 / Math.max(1e-9, x1 - x0), 120 / Math.max(1e-9, h)), ox = 210 - (x0 + x1) / 2 * k, oy = 112 + h * k / 2;
		function P(p) { return [ox + p[0] * k, oy - p[1] * k]; } var pa = P(A), pb = P(B), pc = P(C), cen = [(pa[0] + pb[0] + pc[0]) / 3, (pa[1] + pb[1] + pc[1]) / 3];
		function lab(p, q, txt) { var m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], dx = m[0] - cen[0], dy = m[1] - cen[1], n = Math.hypot(dx, dy) || 1; return '<text class="t-lbl" x="' + (m[0] + dx / n * 17).toFixed(1) + '" y="' + (m[1] + dy / n * 15 + 4).toFixed(1) + '">' + txt + "</text>"; }
		function vl(p, nm, v) { var dx = p[0] - cen[0], dy = p[1] - cen[1], n = Math.hypot(dx, dy) || 1; return '<text class="t-lbl" style="fill:#d64545" x="' + (p[0] + dx / n * 26).toFixed(1) + '" y="' + (p[1] + dy / n * 20 + 4).toFixed(1) + '">' + nm + " " + T(v, 1) + "°</text>"; }
		var g = lab(pb, pc, "a = " + T(s.a, 3)) + lab(pc, pa, "b = " + T(s.b, 3)) + lab(pa, pb, "c = " + T(s.c, 3)) + vl(pa, "A", s.A) + vl(pb, "B", s.B) + vl(pc, "C", s.C), tp = st.tpos["tri" + si] || [0, 0], z = st.tsz;
		var tf = "translate(" + tp[0].toFixed(1) + "," + tp[1].toFixed(1) + ") translate(210,112) scale(" + z + ") translate(-210,-112)";
		return '<svg viewBox="0 0 420 224" role="img" aria-label="The triangle"><g transform="' + tf + '"><polygon data-tm="' + si + '" class="t-fg" points="' + [pa, pb, pc].map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>' + lbPost("tri" + si, g) + "</g></svg>";
	}
	function rTri() {
		var out = $("tg-t-out"), ks = {}, n = 0, need = st.tmode === "right" ? 2 : 3; FIELDS[st.tmode].forEach(function (f) { var raw = (ts[f[0]] || "").trim(); if (raw) { var v = TR.parseAngle(raw, "deg"); if (f[0] > "Z" || true) { var nn = parseFloat(raw.replace(",", ".")); ks[f[0]] = nn; n++; } } });
		var bad = Object.keys(ks).filter(function (k) { return !(ks[k] > 0) || !isFinite(ks[k]); }); if (bad.length) { out.innerHTML = '<div class="tu-card"><span class="tg-bad">Values must be positive numbers (' + bad.join(", ") + ").</span></div>"; return; }
		if (n < need) { out.innerHTML = '<div class="tu-card tu-card--tint">Enter ' + (need - n) + " more value" + (need - n === 1 ? "" : "s") + " to solve the triangle.</div>"; return; }
		if (n > need) { out.innerHTML = '<div class="tu-card"><span class="tg-bad">Too many values: leave exactly ' + need + " filled in (the others are calculated).</span></div>"; return; }
		var known = Object.assign({}, ks); if (st.tmode === "right") known.C = 90; var res = TR.solveTriangle(known);
		if (!res.ok) { out.innerHTML = '<div class="tu-card"><span class="tg-bad">' + esc(res.error) + "</span></div>"; return; }
		out.innerHTML = '<div class="tu-card tu-card--tint"><b>' + esc(res.case) + ":</b> " + esc(res.note) + "</div>" + res.solutions.map(function (s, i) {
			return '<div class="tu-card tg-sol"><h3>' + (res.solutions.length > 1 ? "Triangle " + (i + 1) : "Solution") + '</h3><div class="tg-fig">' + figure(s, i) + '</div><div class="tu-table-wrap"><table class="tu-table"><thead><tr><th>Side</th><th>Length</th><th>Angle</th><th>Size</th></tr></thead><tbody>' + ["a", "b", "c"].map(function (k, j) { var A = ["A", "B", "C"][j]; return "<tr><td>" + k + "</td><td>" + T(s[k], 6) + "</td><td>" + A + "</td><td>" + T(s[A], 5) + "° (" + T(s[A] * R, 5) + " rad)</td></tr>"; }).join("") + "</tbody></table></div><p style=\"margin:0.6em 0 0;\">Area = ½ab sin C = <b>" + T(s.area, 6) + "</b> · Perimeter = <b>" + T(s.perimeter, 6) + "</b></p></div>";
		}).join("");
	}

	/* ================= GRAPHS ================= */
	var GS = [["A", "Amplitude A", -3, 3, 0.1], ["B", "Frequency B", 0.25, 4, 0.05], ["C", "Phase shift C (°)", -180, 180, 5], ["D", "Midline D", -3, 3, 0.1]], GW = 640, GH = 330, GL = 44, GR = 12, GT = 12, GB = 26, X0 = -180, X1 = 540, YM = 5;
	$("tg-g-sl").innerHTML = GS.map(function (s) { return '<div><label for="tg-g-' + s[0] + '">' + s[1] + ' = <b id="tg-g-' + s[0] + 'o"></b></label><input type="range" id="tg-g-' + s[0] + '" data-k="' + s[0] + '" min="' + s[2] + '" max="' + s[3] + '" step="' + s[4] + '"></div>'; }).join("");
	$("tg-g-sl").addEventListener("input", function (e) { var k = e.target.dataset.k; if (k) { st.g[k] = +e.target.value; save(); rGraph(); } });
	$("tg-g-fn").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { st.fn = b.dataset.f; save(); rGraph(); } });
	$("tg-g-par").addEventListener("change", function () { st.par = this.checked; save(); rGraph(); });
	$("tg-g-reset").addEventListener("click", function () { st.g = { A: 1, B: 1, C: 0, D: 0 }; save(); rGraph(); });
	function gx(x) { return GL + (x - X0) / (X1 - X0) * (GW - GL - GR); } function gy(y) { return GT + (YM - y) / (2 * YM) * (GH - GT - GB); }
	function path(fn, p) { var segs = [], cur = [], prev = null; for (var x = X0; x <= X1; x += 0.5) { var y = TR.evalSinusoid(fn, p, x); if (!isFinite(y) || Math.abs(y) > 50 || (prev != null && Math.abs(y - prev) > 8 && fn === "tan")) { if (cur.length > 1) segs.push(cur); cur = []; prev = null; continue; } cur.push(gx(x).toFixed(1) + "," + gy(Math.max(-YM - 1, Math.min(YM + 1, y))).toFixed(1)); prev = y; } if (cur.length > 1) segs.push(cur); return segs; }
	function rGraph() {
		var fn = st.fn, p = st.g, s = "", i; [].forEach.call($("tg-g-fn").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.f === fn)); }); GS.forEach(function (q) { $("tg-g-" + q[0]).value = p[q[0]]; $("tg-g-" + q[0] + "o").textContent = T(p[q[0]], 2); });
		for (i = -4; i <= 4; i++) s += '<line class="t-gr" x1="' + GL + '" y1="' + gy(i) + '" x2="' + (GW - GR) + '" y2="' + gy(i) + '"/><text class="t-tx" x="' + (GL - 6) + '" y="' + (gy(i) + 4) + '" text-anchor="end">' + i + "</text>";
		for (i = -180; i <= 540; i += 90) s += '<line class="t-gr" x1="' + gx(i) + '" y1="' + GT + '" x2="' + gx(i) + '" y2="' + (GH - GB) + '"/><text class="t-tx" x="' + gx(i) + '" y="' + (GH - 8) + '" text-anchor="middle">' + i + "°</text>";
		s += '<line class="t-ax" x1="' + GL + '" y1="' + gy(0) + '" x2="' + (GW - GR) + '" y2="' + gy(0) + '"/><line class="t-ax" x1="' + gx(0) + '" y1="' + GT + '" x2="' + gx(0) + '" y2="' + (GH - GB) + '"/>';
		var info = TR.sinusoid(fn, p);
		if (p.D !== 0) s += '<line x1="' + GL + '" y1="' + gy(p.D) + '" x2="' + (GW - GR) + '" y2="' + gy(p.D) + '" stroke="#8a93a0" stroke-width="1.4" stroke-dasharray="6 4"/>';
		if (st.par) path(fn, { A: 1, B: 1, C: 0, D: 0 }).forEach(function (sg) { s += '<polyline points="' + sg.join(" ") + '" fill="none" stroke="#9aa5b4" stroke-width="2" stroke-dasharray="6 5"/>'; });
		path(fn, p).forEach(function (sg) { s += '<polyline points="' + sg.join(" ") + '" fill="none" stroke="' + FN[fn] + '" stroke-width="3.2" stroke-linejoin="round"/>'; });
		if (fn === "tan") for (var k = -3; k <= 6; k++) { var ax = (90 + 180 * k) / p.B + p.C; if (ax > X0 && ax < X1) s += '<line x1="' + gx(ax) + '" y1="' + GT + '" x2="' + gx(ax) + '" y2="' + (GH - GB) + '" stroke="#c0392b" stroke-width="1" stroke-dasharray="3 5" opacity="0.5"/>'; }
		s += '<g id="tg-g-cur"></g>'; $("tg-svg-g").innerHTML = s;
		var ph = p.C ? " (x " + (p.C > 0 ? "− " : "+ ") + T(Math.abs(p.C), 1) + "°)" : "";
		var eq = "y = " + (p.A === 1 ? "" : p.A === -1 ? "−" : T(p.A, 2) + " ") + fn + (p.B === 1 && !p.C ? " x" : "(" + (p.B === 1 ? "" : T(p.B, 2)) + (p.C ? (p.B === 1 ? "" : "") + "(x" + (p.C > 0 ? " − " : " + ") + T(Math.abs(p.C), 1) + "°)" : "x") + ")") + (p.D ? (p.D > 0 ? " + " : " − ") + T(Math.abs(p.D), 2) : ""); $("tg-g-eq").textContent = eq;
		$("tg-g-stats").innerHTML = (fn === "tan" ? stat("Amplitude", "none", "tan grows without limit") : stat("Amplitude", T(info.amplitude, 3), "|A|, half the height from min to max")) + stat("Period", T(info.period, 3) + "°", T(info.period * R, 4) + " rad · " + (fn === "tan" ? "180°" : "360°") + " ÷ |B|") + stat("Phase shift", T(p.C, 2) + "°", p.C > 0 ? "shifted right" : p.C < 0 ? "shifted left" : "none") + stat("Midline", "y = " + T(p.D, 2), "vertical shift D") + (fn === "tan" ? stat("Asymptotes", "x = " + T(90 / p.B + p.C, 2) + "° + k·" + T(info.period, 2) + "°", "where the function is undefined") : stat("Range", T(info.min, 2) + " to " + T(info.max, 2), "Frequency " + T(info.frequency * 360, 3) + " cycles per 360°"));
	}
	$("tg-svg-g").addEventListener("pointermove", function (e) {
		var svg = this, q = svgPoint(svg, e), x = X0 + (q.x - GL) / (GW - GL - GR) * (X1 - X0); if (x < X0 || x > X1) return; var y = TR.evalSinusoid(st.fn, st.g, x), c = svg.querySelector("#tg-g-cur"); if (!c) return;
		c.innerHTML = isFinite(y) && Math.abs(y) < YM + 1 ? '<line x1="' + gx(x) + '" y1="' + GT + '" x2="' + gx(x) + '" y2="' + (GH - GB) + '" stroke="#e08a1e" stroke-width="1.5"/><circle cx="' + gx(x) + '" cy="' + gy(y) + '" r="5" fill="#e08a1e"/>' : ""; $("tg-g-trace").textContent = "x = " + T(x, 1) + "° (" + T(x * R, 3) + " rad), y = " + (isFinite(y) ? T(y, 4) : "undefined");
	});

	/* ================= TABLES & IDENTITIES ================= */
	function rTable() {
		var max = +$("tg-tb-r").value, step = +$("tg-tb-s").value, dc = +$("tg-tb-d").value, ex = $("tg-tb-x").checked, rows = "", hasEx = false, d;
		st.tr = step; st.ts = max; st.td = dc; st.tx = ex; save(); var cnt = 0;
		for (d = 0; d <= max + 1e-9; d += step) { var t = TR.trig(d), e = ex ? TR.exact(d) : null; if (e) hasEx = true; rows += "<tr><td><b>" + d + "°</b></td><td>" + (TR.piFraction(d) || T(d * R, 4)) + "</td><td>" + num(t.sin, dc) + "</td><td>" + num(t.cos, dc) + "</td><td>" + num(t.tan, dc) + "</td>" + (ex ? "<td>" + (e ? esc(e.sin) : "") + "</td><td>" + (e ? esc(e.cos) : "") + "</td><td>" + (e && e.tan ? esc(e.tan) : "") + "</td>" : "") + "</tr>"; if (++cnt > 400) break; }
		$("tg-tb").innerHTML = "<thead><tr><th>Angle</th><th>Radians</th><th>sin</th><th>cos</th><th>tan</th>" + (ex ? "<th>sin exact</th><th>cos exact</th><th>tan exact</th>" : "") + "</tr></thead><tbody>" + rows + "</tbody>";
	}
	["tg-tb-r", "tg-tb-s", "tg-tb-d", "tg-tb-x"].forEach(function (id) { $(id).addEventListener("change", rTable); });
	$("tg-id-s").innerHTML = TR.IDENTITIES.map(function (i) { return '<option value="' + i.id + '">' + esc(i.group + ": " + i.name) + "</option>"; }).join("");
	function rIdent() {
		var id = TR.IDENTITIES.filter(function (i) { return i.id === $("tg-id-s").value; })[0] || TR.IDENTITIES[0], x = parseFloat($("tg-id-x").value.replace(",", ".")), y = parseFloat($("tg-id-y").value.replace(",", ".")); st.id = id.id; st.ix = $("tg-id-x").value; st.iy = $("tg-id-y").value; save(); $("tg-id-yf").hidden = !id.two;
		if (!isFinite(x) || (id.two && !isFinite(y))) { $("tg-id-out").textContent = "Enter the angle(s) in degrees."; return; }
		var l = id.l(x, y), r = id.r(x, y); if (!isFinite(l) || !isFinite(r)) { $("tg-id-out").innerHTML = '<span class="tg-bad">This identity is not defined at these angles</span> (a tan, cot, sec or csc blows up). Try other values.'; return; }
		var ok = Math.abs(l - r) < 1e-9 * Math.max(1, Math.abs(l)); $("tg-id-out").innerHTML = "<b>" + esc(id.name) + "</b><br>at x = " + T(x, 4) + "°" + (id.two ? ", y = " + T(y, 4) + "°" : "") + ":<br>Left side = <b>" + T(l, 10) + "</b><br>Right side = <b>" + T(r, 10) + "</b><br>" + (ok ? '<span class="tg-ok">Equal ✓ (difference ' + (Math.abs(l - r) < 1e-12 ? "0" : (l - r).toExponential(1)) + ")</span>" : '<span class="tg-bad">Not equal: difference ' + T(l - r, 8) + "</span>");
	}
	["tg-id-s", "tg-id-x", "tg-id-y"].forEach(function (id) { $(id).addEventListener("input", rIdent); });
	(function () { var g = "", s = ""; TR.IDENTITIES.forEach(function (i) { if (i.group !== g) { g = i.group; s += '<tr><td colspan="1"><b>' + esc(g) + "</b></td></tr>"; } s += "<tr><td>&nbsp;&nbsp;" + esc(i.name) + "</td></tr>"; }); $("tg-id-ref").innerHTML = s; })();

	/* ================= tabs ================= */
	function show(tab) {
		st.tab = tab; save(); [].forEach.call($("tg-tabs").children, function (b) { b.setAttribute("aria-pressed", String(b.dataset.t === tab)); b.setAttribute("aria-selected", String(b.dataset.t === tab)); }); [].forEach.call(root.querySelectorAll("section[data-p]"), function (s) { s.hidden = s.dataset.p !== tab; });
		if (tab === "circle") { syncC(); setAngle(st.ang); } else if (tab === "calc") { aFields(); $("tg-i-fn").value = st.ifn; $("tg-i-v").value = st.iv; rCalc(); rInv(); } else if (tab === "tri") { buildT(); rTri(); } else if (tab === "graph") rGraph(); else { $("tg-tb-r").value = st.ts; $("tg-tb-s").value = st.tr; $("tg-tb-d").value = st.td; $("tg-tb-x").checked = st.tx; $("tg-id-s").value = st.id; $("tg-id-x").value = st.ix; $("tg-id-y").value = st.iy; rTable(); rIdent(); }
	}
	$("tg-tabs").addEventListener("click", function (e) { var b = e.target.closest("button"); if (b) { show(b.dataset.t); try { history.replaceState(null, "", "?tab=" + b.dataset.t); } catch (x) {} } });
	load(); var qp = new URLSearchParams(location.search), tq = qp.get("tab"); if (tq && /^(circle|calc|tri|graph|tables)$/.test(tq)) st.tab = tq; var aq = qp.get("a"); if (aq) { var av = TR.parseAngle(aq, "deg"); if (av != null) { st.ang = av; st.aDeg = av; } }
	show(st.tab);
})();
