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
		var v = vals(); st.v[st.s] = v; save(); var r = SH.compute(st.s, v); cur = null;
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
	function show() { $("sh-unit").value = st.u; buildChips(); buildFields(); update(); }
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

	load(); fromUrl(); show();
})();
