/* MES Volume, Area & Surface Area Calculator -- mes.fm/shapes-calculator (UI; maths in lib.js, global SH).
 * localStorage "mes-shapes-calculator:v1" = { s: shape id, u: unit, v: { shape id: { key: text } } }. Links: ?s=cylinder&r=3&h=5&u=cm */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("sh"); if (!root || !window.SH) return;
	var KEY = "mes-shapes-calculator:v1";
	var st = { s: "cylinder", u: "cm", v: {} };
	var EXAMPLE = { square: { a: 5 }, rectangle: { a: 8, b: 5 }, triangle: { a: 7, b: 8, c: 9 }, "triangle-bh": { b: 10, h: 6 }, circle: { r: 4 }, ellipse: { a: 6, b: 4 }, trapezoid: { a: 6, b: 10, h: 4 }, parallelogram: { b: 9, h: 5 }, rhombus: { p: 8, q: 6 }, "regular-polygon": { n: 6, a: 4 }, sector: { r: 6, t: 60 }, annulus: { R: 5, r: 3 },
		cube: { a: 4 }, box: { a: 6, b: 4, c: 3 }, prism: { a: 3, b: 4, c: 5, l: 10 }, cylinder: { r: 3, h: 10 }, cone: { r: 3, h: 4 }, frustum: { R: 5, r: 2, h: 6 }, sphere: { r: 5 }, hemisphere: { r: 5 }, capsule: { r: 2, h: 6 }, ellipsoid: { a: 5, b: 3, c: 2 }, torus: { R: 6, r: 2 }, pyramid: { a: 6, h: 4 }, "rect-pyramid": { a: 6, b: 4, h: 5 }, tetrahedron: { a: 4 }, octahedron: { a: 4 } };
	function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function load() { try { var s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s && SH.byId(s.s)) { st.s = s.s; if (SH.UNITS[s.u]) st.u = s.u; if (s.v && typeof s.v === "object") st.v = s.v; } } catch (e) {} }
	function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
	function fromUrl() { var q = new URLSearchParams(location.search), id = q.get("s"); if (!id || !SH.byId(id)) return; st.s = id; if (SH.UNITS[q.get("u")]) st.u = q.get("u"); var v = {}; SH.byId(id).inputs.forEach(function (i) { if (q.has(i[0])) v[i[0]] = q.get(i[0]).slice(0, 20); }); st.v[id] = v; }
	function toast(msg) { var t = $("sh-toast"); if (!t) { t = document.createElement("div"); t.id = "sh-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 1700); }
	function copy(text, msg) { function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) { toast("Copy failed"); } document.body.removeChild(ta); } if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb(); }

	/* ---- diagrams (viewBox 200 x 150) ---- */
	function pg(pts, c) { return '<polygon class="' + (c || "sh-fill") + '" points="' + pts.map(function (p) { return p.join(","); }).join(" ") + '"/>'; }
	function ln(a, b, c) { return '<line class="' + (c || "sh-line") + '" x1="' + a[0] + '" y1="' + a[1] + '" x2="' + b[0] + '" y2="' + b[1] + '"/>'; }
	function tx(t, x, y) { return '<text class="sh-lt" x="' + x + '" y="' + y + '" text-anchor="middle">' + t + "</text>"; }
	function el(cx, cy, rx, ry, c) { return '<ellipse class="' + (c || "sh-fill") + '" cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '"/>'; }
	function arc(cx, cy, rx, ry, c, front) { return '<path class="' + c + '" d="M' + (cx - rx) + "," + cy + " A" + rx + "," + ry + " 0 0 " + (front ? 0 : 1) + " " + (cx + rx) + "," + cy + '"/>'; }
	var D = {
		square: function () { return pg([[50, 25], [150, 25], [150, 125], [50, 125]]) + tx("a", 100, 144) + tx("a", 166, 80); },
		rectangle: function () { return pg([[25, 35], [175, 35], [175, 115], [25, 115]]) + tx("a", 100, 136) + tx("b", 188, 80); },
		triangle: function () { return pg([[25, 120], [175, 120], [120, 25]]) + tx("a", 100, 140) + tx("b", 156, 66) + tx("c", 60, 62); },
		"triangle-bh": function () { return pg([[25, 120], [175, 120], [120, 25]]) + ln([120, 25], [120, 120], "sh-hid") + tx("b", 100, 140) + tx("h", 132, 78); },
		circle: function () { return el(100, 75, 58, 58) + ln([100, 75], [158, 75]) + tx("r", 130, 68) + '<circle cx="100" cy="75" r="2.5" fill="#2c3e55"/>'; },
		ellipse: function () { return el(100, 75, 80, 50) + ln([100, 75], [180, 75], "sh-hid") + ln([100, 75], [100, 25], "sh-hid") + tx("a", 142, 68) + tx("b", 112, 52); },
		trapezoid: function () { return pg([[55, 35], [145, 35], [180, 115], [20, 115]]) + ln([145, 35], [145, 115], "sh-hid") + tx("a", 100, 28) + tx("b", 100, 138) + tx("h", 157, 80); },
		parallelogram: function () { return pg([[65, 35], [185, 35], [145, 115], [25, 115]]) + ln([65, 35], [65, 115], "sh-hid") + tx("b", 105, 138) + tx("h", 52, 80) + tx("s", 24, 70); },
		rhombus: function () { return pg([[100, 15], [175, 75], [100, 135], [25, 75]]) + ln([25, 75], [175, 75], "sh-hid") + ln([100, 15], [100, 135], "sh-hid") + tx("p", 140, 70) + tx("q", 112, 45); },
		"regular-polygon": function () { return pg([[100, 15], [170, 66], [143, 138], [57, 138], [30, 66]]) + tx("a", 100, 150).replace('y="150"', 'y="148"'); },
		sector: function () { return '<path class="sh-fill" d="M40,125 L150,125 A110,110 0 0 0 118.5,47.1 Z"/>' + tx("r", 95, 142) + tx("θ", 66, 112); },
		annulus: function () { return el(100, 75, 62, 62) + el(100, 75, 32, 32, "sh-fill") + ln([100, 75], [162, 75], "sh-hid") + ln([100, 75], [100 - 22.6, 75 - 22.6], "sh-hid") + tx("R", 140, 68) + tx("r", 88, 70); },
		cube: function () { return pg([[70, 40], [150, 40], [150, 120], [70, 120]], "sh-hid") + pg([[40, 55], [120, 55], [150, 40], [70, 40]]) + pg([[40, 55], [120, 55], [120, 135], [40, 135]]) + pg([[120, 55], [150, 40], [150, 120], [120, 135]]) + tx("a", 80, 150) + tx("a", 30, 98); },
		box: function () { return pg([[40, 55], [150, 55], [180, 35], [70, 35]]) + pg([[40, 55], [150, 55], [150, 125], [40, 125]]) + pg([[150, 55], [180, 35], [180, 105], [150, 125]]) + tx("a", 95, 142) + tx("b", 183, 128).replace('x="183"', 'x="175"').replace('y="128"', 'y="55"') + tx("c", 28, 94); },
		prism: function () { return pg([[30, 120], [100, 120], [65, 55]]) + pg([[30, 120], [100, 120], [170, 95], [100, 95]], "sh-fill") + pg([[100, 120], [170, 95], [135, 30], [65, 55]], "sh-fill") + pg([[30, 120], [100, 120], [65, 55]]) + tx("l", 140, 118) + tx("a", 65, 140) + tx("b", 94, 82) + tx("c", 36, 84); },
		cylinder: function () { return '<path class="sh-fill" d="M50,32 L50,118 A50,14 0 0 0 150,118 L150,32 Z"/>' + el(100, 32, 50, 14) + ln([100, 32], [150, 32], "sh-dim") + ln([160, 32], [160, 118], "sh-dim") + tx("r", 126, 27) + tx("h", 174, 80); },
		cone: function () { return '<path class="sh-fill" d="M100,15 L40,112 A60,15 0 0 0 160,112 Z"/>' + ln([100, 15], [100, 112], "sh-hid") + ln([100, 112], [160, 112], "sh-dim") + tx("h", 110, 66) + tx("r", 130, 128); },
		frustum: function () { return '<path class="sh-fill" d="M70,30 L30,115 A70,16 0 0 0 170,115 L130,30 Z"/>' + el(100, 30, 30, 8) + ln([100, 30], [130, 30], "sh-dim") + ln([100, 115], [170, 115], "sh-dim") + ln([100, 30], [100, 115], "sh-hid") + tx("r", 116, 24) + tx("R", 136, 132) + tx("h", 112, 78); },
		sphere: function () { return el(100, 75, 60, 60) + arc(100, 75, 60, 16, "sh-hid", false) + arc(100, 75, 60, 16, "sh-line", true) + ln([100, 75], [160, 75], "sh-dim") + tx("r", 130, 68); },
		hemisphere: function () { return '<path class="sh-fill" d="M35,95 A65,65 0 0 1 165,95 Z"/>' + el(100, 95, 65, 16) + ln([100, 95], [165, 95], "sh-dim") + tx("r", 134, 90); },
		capsule: function () { return '<path class="sh-fill" d="M70,25 A30,30 0 0 0 40,55 L40,95 A30,30 0 0 0 100,95 L100,55 A30,30 0 0 0 70,25 Z" transform="translate(30,0)"/>' + arc(100, 55, 30, 8, "sh-hid", false) + arc(100, 95, 30, 8, "sh-hid", false) + ln([100, 75], [130, 75], "sh-dim") + ln([150, 55], [150, 95], "sh-dim") + tx("r", 116, 69) + tx("h", 164, 80); },
		ellipsoid: function () { return el(100, 75, 80, 50) + arc(100, 75, 80, 16, "sh-hid", false) + arc(100, 75, 80, 16, "sh-line", true) + ln([100, 75], [180, 75], "sh-dim") + ln([100, 75], [100, 25], "sh-dim") + ln([100, 75], [70, 90], "sh-dim") + tx("a", 144, 68) + tx("b", 112, 52) + tx("c", 78, 106); },
		torus: function () { return el(100, 75, 80, 48) + el(100, 75, 34, 16, "sh-fill").replace("sh-fill", "sh-hid") + ln([100, 75], [140, 75], "sh-dim") + ln([140, 75], [170, 75], "sh-dim") + tx("R", 120, 68) + tx("r", 158, 68); },
		pyramid: function () { return pg([[100, 15], [30, 120], [150, 120]]) + pg([[100, 15], [150, 120], [185, 90]], "sh-fill") + ln([100, 15], [100, 120], "sh-hid") + ln([30, 120], [65, 90], "sh-hid") + ln([65, 90], [185, 90], "sh-hid") + ln([65, 90], [100, 15], "sh-hid") + tx("h", 90, 76) + tx("a", 90, 140); },
		"rect-pyramid": function () { return pg([[100, 15], [30, 120], [150, 120]]) + pg([[100, 15], [150, 120], [185, 90]], "sh-fill") + ln([100, 15], [100, 120], "sh-hid") + ln([30, 120], [65, 90], "sh-hid") + ln([65, 90], [185, 90], "sh-hid") + ln([65, 90], [100, 15], "sh-hid") + tx("h", 90, 76) + tx("a", 90, 140) + tx("b", 176, 114); },
		tetrahedron: function () { return pg([[100, 15], [30, 120], [165, 120]]) + ln([100, 15], [120, 92], "sh-line") + ln([30, 120], [120, 92], "sh-hid") + ln([165, 120], [120, 92], "sh-hid") + tx("a", 100, 140); },
		octahedron: function () { return pg([[100, 12], [30, 80], [100, 105], [170, 80]]) + pg([[100, 148], [30, 80], [100, 105], [170, 80]], "sh-fill") + ln([30, 80], [170, 80], "sh-hid") + tx("a", 56, 40); }
	};
	function drawPic(id) { var f = D[id]; $("sh-pic").innerHTML = f ? '<svg viewBox="0 0 200 150" role="presentation">' + f() + "</svg>" : ""; }

	/* ---- layout ---- */
	function groups(dim) { var out = [], seen = {}; SH.SHAPES.forEach(function (s) { if (s.dim !== dim) return; var g = s.group || ""; if (!seen[g]) { seen[g] = []; out.push([g, seen[g]]); } seen[g].push(s); }); return out; }
	function buildChips() {
		var dim = SH.byId(st.s).dim, html = "";
		groups(dim).forEach(function (g) { if (g[0]) html += '<div class="sh-g">' + esc(g[0]) + "</div>"; g[1].forEach(function (s) { html += '<button type="button" class="tu-chip" data-s="' + s.id + '" aria-pressed="' + (s.id === st.s) + '">' + esc(s.name) + "</button>"; }); });
		$("sh-shapes").innerHTML = html;
		[].forEach.call($("sh-dim").children, function (b) { b.setAttribute("aria-pressed", String(+b.dataset.d === dim)); });
	}
	function buildFields() {
		var S = SH.byId(st.s), v = st.v[st.s] || {}, u = st.u; $("sh-title").textContent = S.name;
		$("sh-fields").innerHTML = S.inputs.map(function (i) {
			var isN = i[0] === "n", isA = S.id === "sector" && i[0] === "t", suf = isN ? "" : isA ? "°" : u;
			return '<div class="tu-field"><label for="sh-i-' + i[0] + '">' + esc(i[1]) + '</label><div class="tu-suffix"><input id="sh-i-' + i[0] + '" data-k="' + i[0] + '" class="tu-input tu-input--big" type="text" inputmode="decimal" autocomplete="off" value="' + esc(v[i[0]] || "") + '">' + (suf ? "<span>" + esc(suf) + "</span>" : "") + "</div></div>";
		}).join("");
		drawPic(S.id);
	}
	function vals() { var o = {}; [].forEach.call($("sh-fields").querySelectorAll("input"), function (i) { o[i.dataset.k] = i.value; }); return o; }
	function uk(kind) { return kind === "vol" ? SH.UNIT_VOL(st.u) : kind === "area" ? st.u + "²" : kind === "angle" ? "°" : st.u; }

	/* ---- results ---- */
	var cur = null;
	function update() {
		var v = vals(); st.v[st.s] = v; save(); if (window.v3Build_) v3Build_(); var r = SH.compute(st.s, v); cur = null;
		$("sh-empty").hidden = r.ok || !!r.error; $("sh-err").hidden = !r.error; $("sh-res").hidden = !r.ok; if (r.error) $("sh-err").textContent = r.error; if (!r.ok) return;
		cur = r; var u = st.u, main = r.results[0];
		$("sh-stats").innerHTML = r.results.map(function (x, i) {
			var suf = x.kind === "vol" ? u + "³" : x.kind === "area" ? u + "²" : x.kind === "angle" ? "°" : u;
			return '<div class="tu-stat' + (i < 2 ? " tu-stat--hero" : "") + '" data-i="' + i + '" tabindex="0" role="button" title="Click to copy"><div class="tu-stat__label">' + esc(x.label) + '</div><div class="tu-stat__value">' + esc(SH.pretty(x.value)) + " <small>" + suf + '</small></div><div class="sh-f">' + esc(x.formula) + "</div></div>";
		}).join("");
		var rows = []; r.results.forEach(function (x) {
			if (x.kind === "vol") { var m3 = SH.convert(x.value, 3, u, "m"), c = SH.capacity(m3); rows.push([x.label, [["litres", c.litres], ["millilitres", c.ml], ["cubic metres", c.m3], ["cubic feet", c.cubicFeet], ["US gallons", c.gallonsUS], ["US cups", c.cups]]]); }
			else if (x.kind === "area" && /^(Area|Surface|Total|Base|Lateral|Curved)/.test(x.label)) { var a = SH.areaUnits(SH.convert(x.value, 2, u, "m")); rows.push([x.label, [["m²", a.m2], ["cm²", a.cm2], ["ft²", a.ft2], ["acres", a.acres], ["hectares", a.hectares]]]); }
		});
		$("sh-conv").innerHTML = "<tbody>" + rows.map(function (rw) { return "<tr><td><b>" + esc(rw[0]) + "</b></td><td>" + rw[1].map(function (p) { return esc(SH.pretty(p[1])) + " " + esc(p[0]); }).join(" &nbsp;&middot;&nbsp; ") + "</td></tr>"; }).join("") + "</tbody>";
		var ks = r.results.map(function (x, i) { return [x, i]; }).filter(function (p) { return p[0].kind === "vol" || p[0].kind === "area"; }), sel = $("sh-back-k"), old = sel.value;
		sel.innerHTML = ks.map(function (p) { return '<option value="' + p[1] + '">' + esc(p[0].label) + "</option>"; }).join(""); if (old && sel.querySelector('option[value="' + old + '"]')) sel.value = old;
		back();
	}
	function back() {
		var out = $("sh-back"), sel = $("sh-back-k"); if (!cur) return; var x = cur.results[+sel.value]; if (!x) { out.textContent = ""; return; } $("sh-back-u").textContent = uk(x.kind);
		var t = SH.num($("sh-back-v").value); if (!(t > 0)) { out.textContent = "Enter a target to see how big the shape must be."; return; }
		var k = SH.scaleFor(st.s, vals(), x.kind, t); if (!k) { out.textContent = ""; return; }
		var S = SH.byId(st.s), parts = S.inputs.filter(function (i) { return i[0] !== "n" && !(S.id === "sector" && i[0] === "t"); }).map(function (i) { var n = SH.num(vals()[i[0]]); return n == null ? "" : i[1].split(" (")[0] + " = " + SH.trim(n * k, 4); }).filter(Boolean);
		out.innerHTML = "Multiply every length by <b>" + SH.trim(k, 5) + "</b> (&times;" + SH.trim(k, 3) + "). New sizes: " + esc(parts.join(", ")) + " " + esc(st.u) + ".";
	}

	/* ---- events ---- */
	$("sh-unit").innerHTML = SH.UNIT_ORDER.map(function (u) { return '<option value="' + u + '">' + u + " (" + SH.UNIT_NAMES[u] + ")</option>"; }).join("");
	SH.UNIT_VOL = function (u) { return u + "³"; };
	function show() { $("sh-unit").value = st.u; buildChips(); buildFields(); update(); v3Build(); }
	$("sh-unit").addEventListener("change", function () { var o = st.u, n = this.value; st.u = n; save(); buildFields(); update(); });
	$("sh-dim").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; var d = +b.dataset.d; if (SH.byId(st.s).dim === d) return; st.s = d === 3 ? "cylinder" : "circle"; save(); show(); });
	$("sh-shapes").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; st.s = b.dataset.s; save(); show(); });
	$("sh-fields").addEventListener("input", update);
	$("sh-clear").addEventListener("click", function () { st.v[st.s] = {}; save(); buildFields(); update(); });
	$("sh-ex").addEventListener("click", function () { st.v[st.s] = Object.assign({}, EXAMPLE[st.s] || {}); save(); buildFields(); update(); });
	$("sh-link").addEventListener("click", function () { var q = new URLSearchParams({ s: st.s, u: st.u }), v = vals(); Object.keys(v).forEach(function (k) { if (String(v[k]).trim()) q.set(k, v[k]); }); copy(location.origin + location.pathname + "?" + q.toString(), "Link copied"); });
	function statCopy(el) { var s = el.closest(".tu-stat"); if (!s || !cur) return; var x = cur.results[+s.dataset.i]; copy(SH.pretty(x.value).replace(/,/g, "") + " " + uk(x.kind), "Copied " + x.label.toLowerCase()); }
	$("sh-stats").addEventListener("click", function (e) { statCopy(e.target); });
	$("sh-stats").addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); statCopy(e.target); } });
	$("sh-back-k").addEventListener("change", back); $("sh-back-v").addEventListener("input", back);

	/* ---- reference table ---- */
	$("sh-ref").innerHTML = "<thead><tr><th>Shape</th><th>Formulas</th></tr></thead><tbody>" + SH.SHAPES.map(function (s) {
		var ex = EXAMPLE[s.id], r = ex ? SH.compute(s.id, ex) : null; return "<tr><td><b>" + esc(s.name) + "</b></td><td>" + (r && r.ok ? r.results.map(function (x) { return esc(x.label) + ": " + esc(x.formula); }).join("<br>") : "") + "</td></tr>";
	}).join("") + "</tbody>";


	/* ---- scale-drawing / 3D viewer (plain canvas, painter's algorithm; meshes come from SH.mesh). Drag the white dots to change a dimension, drag a label to move it. ---- */
	var V3 = { yaw: -0.6, pitch: 0.42, zoom: 1, mode: "solid", spin: true, labels: true, mesh: null, id: 0, ptrs: {}, pinch: 0, hot: [], act: null, flat: false, k: 1, frozen: 0, dims: {}, off: {} };
	root.__v3 = V3; try { V3.off = JSON.parse(localStorage.getItem(KEY + ":lab") || "{}") || {}; } catch (e) {}
	function offSave() { try { localStorage.setItem(KEY + ":lab", JSON.stringify(V3.off)); } catch (e) {} }
	function v3Dims() { var S = SH.byId(st.s), cur = vals(), ex = EXAMPLE[st.s], d = {}; S.inputs.forEach(function (i) { var n = SH.num(cur[i[0]]); d[i[0]] = n != null && (n > 0 || (S.id === "capsule" && i[0] === "h" && n === 0)) ? n : ex[i[0]]; }); return SH.compute(st.s, d).ok ? d : Object.assign({}, ex); }
	function v3Build() {
		var box = $("sh-3d"), d = v3Dims(), M = SH.mesh(st.s, d, 64); if (!M) { box.hidden = true; V3.mesh = null; return; } box.hidden = false; V3.dims = d;
		var flat = SH.byId(st.s).dim === 2; if (flat !== V3.flat) { V3.flat = flat; if (flat) { V3.yaw = 0; V3.pitch = 0; } else { V3.yaw = -0.6; V3.pitch = 0.42; } }
		$("sh-3d-spin").parentNode.hidden = flat; $("sh-3d-note").innerHTML = flat ? "A scale drawing of your shape. <b>Drag a white dot</b> to change that length, or drag a label to move it." : "Drag the picture to rotate, scroll or pinch to zoom. <b>Drag a white dot</b> to change that length; drag a label to move it. Uses an example until you type valid numbers.";
		var mx = 0; M.verts.forEach(function (p) { mx = Math.max(mx, Math.hypot(p[0], p[1], p[2])); }); var k = V3.frozen ? V3.k : 1.35 / (mx || 1); V3.k = k;
		M.verts = M.verts.map(function (p) { return [p[0] * k, p[1] * k, p[2] * k]; }); M.lines.forEach(function (l) { l.a = [l.a[0] * k, l.a[1] * k, l.a[2] * k]; l.b = [l.b[0] * k, l.b[1] * k, l.b[2] * k]; }); V3.mesh = M; v3Draw(); v3Loop();
	}
	function v3Color() { var c = getComputedStyle(root).getPropertyValue("--accent").trim(), m; if ((m = /^#([0-9a-f]{6})$/i.exec(c))) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4), 16)]; if ((m = /(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c))) return [+m[1], +m[2], +m[3]]; return [15, 108, 189]; }
	var UN = { mm: "mm", cm: "cm", m: "m", km: "km", in: "in", ft: "ft", yd: "yd", mi: "mi" };
	function v3Draw() {
		var M = V3.mesh, cv = $("sh-cv"); if (!M || $("sh-3d").hidden) return; var dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 400, h = Math.round(Math.min(420, w * 0.75)); if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + "px"; }
		var g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h); var dark = document.body.classList.contains("dark-mode"), col = v3Color(), ink = dark ? "205,214,228" : "44,62,85";
		var cy = Math.cos(V3.yaw), sy = Math.sin(V3.yaw), cp = Math.cos(V3.pitch), sp = Math.sin(V3.pitch), D = 5.5, sc = Math.min(w, h) * (V3.flat ? 0.33 : 0.30) * V3.zoom;
		function rot(p) { var x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy; return [x1, p[1] * cp - z1 * sp, p[1] * sp + z1 * cp]; }
		function scr(q) { var f = D / (D - q[2]); return [w / 2 + sc * f * q[0], h / 2 - sc * f * q[1]]; }
		var Tv = M.verts.map(rot), P = Tv.map(scr), L = [-0.4, 0.55, 0.73], faces = [];
		M.tris.forEach(function (t) {
			var a = Tv[t[0]], b = Tv[t[1]], c = Tv[t[2]], u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], nl = Math.hypot(n[0], n[1], n[2]); if (nl < 1e-12) return;
			var front = n[0] * (0 - a[0]) + n[1] * (0 - a[1]) + n[2] * (D - a[2]) > 0; if (V3.mode === "solid" && !front) return;
			var lam = V3.flat ? 0.85 : Math.abs(n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / nl; faces.push({ t: t, z: (a[2] + b[2] + c[2]) / 3, s: 0.32 + 0.68 * lam });
		});
		faces.sort(function (p, q) { return p.z - q.z; });
		if (V3.mode !== "wire") faces.forEach(function (f) {
			var t = f.t, c0 = [Math.round(col[0] * f.s + 255 * (1 - f.s) * 0.12), Math.round(col[1] * f.s + 255 * (1 - f.s) * 0.12), Math.round(col[2] * f.s + 255 * (1 - f.s) * 0.12)], st2 = "rgb(" + c0.join(",") + ")";
			g.beginPath(); g.moveTo(P[t[0]][0], P[t[0]][1]); g.lineTo(P[t[1]][0], P[t[1]][1]); g.lineTo(P[t[2]][0], P[t[2]][1]); g.closePath(); if (V3.mode === "glass") { g.fillStyle = "rgba(" + c0.join(",") + ",0.22)"; g.fill(); } else { g.fillStyle = st2; g.strokeStyle = st2; g.lineWidth = 0.7; g.fill(); g.stroke(); }
		});
		var flatMesh = M.wire.every(function (e) { return e.length === 2; }); g.lineJoin = "round";
		M.wire.forEach(function (e) { if (V3.mode === "solid" && !flatMesh && !V3.flat) return; g.beginPath(); e.forEach(function (i, k) { if (k) g.lineTo(P[i][0], P[i][1]); else g.moveTo(P[i][0], P[i][1]); }); g.strokeStyle = "rgba(" + ink + "," + (V3.mode === "wire" ? 0.85 : V3.mode === "glass" ? 0.5 : (flatMesh || V3.flat) ? 0.8 : 0.3) + ")"; g.lineWidth = V3.mode === "wire" ? 1.3 : (flatMesh || V3.flat) ? 1.8 : 0.8; g.stroke(); });
		V3.hot = []; var acc = dark ? "#ffd166" : "#c2410c", halo = dark ? "#1d2127" : "#ffffff";
		M.lines.forEach(function (l, li) {
			var A = scr(rot(l.a)), B = scr(rot(l.b)), key = l.t, val = V3.dims[key], ok = val != null && key !== "θ" && SH.byId(st.s).inputs.some(function (i) { return i[0] === key; });
			if (V3.labels) { g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.strokeStyle = acc; g.lineWidth = 3; g.lineCap = "round"; g.stroke(); }
			var oid = st.s + ":" + li, of = V3.off[oid] || [0, 0], lx = (A[0] + B[0]) / 2 + 9 + of[0], ly = (A[1] + B[1]) / 2 - 9 + of[1], txt = key + (val != null ? " = " + SH.trim(val, 3) + " " + st.u : "");
			if (V3.labels) { g.font = "italic 700 16px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.lineWidth = 4; g.strokeStyle = halo; g.strokeText(txt, lx, ly); g.fillStyle = acc; g.fillText(txt, lx, ly); }
			if (V3.labels && ok) { g.beginPath(); g.arc(B[0], B[1], 7, 0, 6.2832); g.fillStyle = "#fff"; g.fill(); g.lineWidth = 3; g.strokeStyle = acc; g.stroke(); }
			V3.hot.push({ key: key, oid: oid, A: A, B: B, lx: lx, ly: ly, tw: g.measureText ? g.measureText(txt).width : 40, slide: ok });
		});
	}
	function v3Loop() { if (V3.id || V3.flat) return; (function tick() { V3.id = 0; if (!V3.mesh || $("sh-3d").hidden || V3.flat) return; if (V3.spin && !document.hidden && !V3.act) { V3.yaw += 0.007; v3Draw(); } V3.id = requestAnimationFrame(tick); })(); }
	function v3Hit(x, y) {
		if (!V3.labels) return null; for (var i = 0; i < V3.hot.length; i++) { var o = V3.hot[i]; if (o.slide && Math.hypot(x - o.B[0], y - o.B[1]) <= 13) return { t: "dim", o: o }; }
		for (var j = 0; j < V3.hot.length; j++) { var q = V3.hot[j]; if (Math.abs(x - q.lx) <= q.tw / 2 + 6 && Math.abs(y - q.ly) <= 12) return { t: "lab", o: q }; } return null;
	}
	function v3Slide(o, x, y) {
		var dx = o.B[0] - o.A[0], dy = o.B[1] - o.A[1], ls = Math.hypot(dx, dy), v0 = V3.dims[o.key], t; if (!(v0 > 0)) return;
		if (ls < 28) t = 1 - ((y - o.B[1]) - 0) / 120 * 0; else t = ((x - o.A[0]) * dx + (y - o.A[1]) * dy) / (ls * ls);
		if (ls < 28) return; t = Math.max(0.2, Math.min(5, t)); var nv = Math.max(0.001, v0 * t); nv = +nv.toPrecision(3); var nd = Object.assign({}, V3.dims); nd[o.key] = nv; if (!SH.compute(st.s, nd).ok) return;
		var inp = $("sh-i-" + o.key); if (!inp) return; V3.frozen = 1; inp.value = SH.trim(nv, 4); inp.dispatchEvent(new Event("input", { bubbles: true }));
	}
	(function () {
		var cv = $("sh-cv"); function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
		$("sh-3d-mode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; V3.mode = b.dataset.m; [].forEach.call(this.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); v3Draw(); });
		$("sh-3d-spin").addEventListener("change", function () { V3.spin = this.checked; v3Loop(); }); $("sh-3d-lab").addEventListener("change", function () { V3.labels = this.checked; v3Draw(); });
		$("sh-3d-reset").addEventListener("click", function () { V3.yaw = V3.flat ? 0 : -0.6; V3.pitch = V3.flat ? 0 : 0.42; V3.zoom = 1; V3.off = {}; offSave(); v3Draw(); });
		cv.addEventListener("pointerdown", function (e) { var p = pos(e); V3.ptrs[e.pointerId] = [e.clientX, e.clientY]; try { cv.setPointerCapture(e.pointerId); } catch (x) {} var hit = Object.keys(V3.ptrs).length === 1 ? v3Hit(p[0], p[1]) : null; if (hit) { V3.act = { h: hit, last: p }; e.preventDefault(); return; } V3.act = null; if (!V3.flat) { V3.spin = false; $("sh-3d-spin").checked = false; } });
		cv.addEventListener("pointermove", function (e) {
			var p = pos(e), ids = Object.keys(V3.ptrs);
			if (!ids.length) { var hv = v3Hit(p[0], p[1]); cv.style.cursor = hv ? (hv.t === "dim" ? "ew-resize" : "move") : (V3.flat ? "default" : "grab"); return; }
			if (V3.act) { var a = V3.act; if (a.h.t === "lab") { var of = V3.off[a.h.o.oid] || [0, 0]; V3.off[a.h.o.oid] = [of[0] + p[0] - a.last[0], of[1] + p[1] - a.last[1]]; a.last = p; v3Draw(); } else v3Slide(a.h.o, p[0], p[1]); return; }
			var prev = V3.ptrs[e.pointerId]; if (!prev) return; if (ids.length === 2) { V3.ptrs[e.pointerId] = [e.clientX, e.clientY]; var A1 = V3.ptrs[ids[0]], B1 = V3.ptrs[ids[1]], d = Math.hypot(A1[0] - B1[0], A1[1] - B1[1]); if (V3.pinch) V3.zoom = Math.max(0.4, Math.min(3, V3.zoom * d / V3.pinch)); V3.pinch = d; v3Draw(); return; }
			if (!V3.flat) { V3.yaw += (e.clientX - prev[0]) * 0.01; V3.pitch = Math.max(-1.5, Math.min(1.5, V3.pitch + (e.clientY - prev[1]) * 0.01)); } V3.ptrs[e.pointerId] = [e.clientX, e.clientY]; v3Draw();
		});
		var up = function (e) { delete V3.ptrs[e.pointerId]; V3.pinch = 0; if (V3.act) { if (V3.act.h.t === "lab") offSave(); V3.act = null; if (V3.frozen) { V3.frozen = 0; v3Build(); } } }; cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
		cv.addEventListener("wheel", function (e) { e.preventDefault(); V3.zoom = Math.max(0.4, Math.min(3, V3.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); v3Draw(); }, { passive: false });
		window.addEventListener("resize", v3Draw); new MutationObserver(v3Draw).observe(document.body, { attributes: true, attributeFilter: ["class"] });
	})();
	window.v3Build_ = v3Build; load(); fromUrl(); show();
})();
