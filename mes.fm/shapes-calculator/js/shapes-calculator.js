/* MES Volume, Area & Surface Area Calculator -- pure maths (no DOM). Browser global `SH`; node: require('./tool_apps_src/shapes-calculator/lib.js'); tests: node tool_apps_src/shapes-calculator-tests.js
 * Every shape = { id, name, dim (2 or 3), inputs [[key, label, hint]], calc(v) -> { results: [[label, value, kind, formula]], error? } } with kind "len" | "area" | "vol" | "angle". Lengths are in the user's unit. */
(function (root) {
	"use strict";
	var PI = Math.PI;
	function num(v) {
		if (v == null) return null; var t = String(v).trim().replace(/\s+/g, ""); if (t === "") return null;
		if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(",", "."); else t = t.replace(/,/g, "");
		if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null; var n = parseFloat(t); return isFinite(n) ? n : null;
	}
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	// pretty number: 4 significant digits, thousands separators, scientific for very big / small
	function pretty(n) {
		if (n == null || !isFinite(n)) return "";
		if (n === 0) return "0"; var a = Math.abs(n);
		if (a >= 1e12 || a < 1e-6) return n.toExponential(4).replace(/\.?0+e/, "e").replace("e+", " × 10^").replace("e-", " × 10^-");
		var d = a >= 1000 ? 2 : a >= 100 ? 3 : a >= 1 ? 4 : 6; var s = trim(n, d), p = s.split("."); p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ","); return p.join(".");
	}
	var UNITS = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 };
	var UNIT_ORDER = ["mm", "cm", "m", "km", "in", "ft", "yd", "mi"];
	var UNIT_NAMES = { mm: "millimetres", cm: "centimetres", m: "metres", km: "kilometres", in: "inches", ft: "feet", yd: "yards", mi: "miles" };
	function sup(k) { return k === 2 ? "²" : k === 3 ? "³" : ""; }
	// convert a value of dimension k (1 length, 2 area, 3 volume) from unit a to unit b
	function convert(v, k, a, b) { return v * Math.pow(UNITS[a] / UNITS[b], k); }
	// volume in the common capacity units: litres, US gallons, millilitres, cubic metres
	function capacity(vM3) { return { m3: vM3, litres: vM3 * 1000, ml: vM3 * 1e6, gallonsUS: vM3 * 264.172052358, cups: vM3 * 4226.75283773, cubicFeet: vM3 / 0.028316846592 }; }
	function areaUnits(aM2) { return { m2: aM2, cm2: aM2 * 1e4, ft2: aM2 / 0.09290304, acres: aM2 / 4046.8564224, hectares: aM2 / 1e4 }; }

	function R(label, value, kind, formula) { return [label, value, kind, formula]; }
	function need(v, keys) { for (var i = 0; i < keys.length; i++) if (!(v[keys[i]] > 0)) return false; return true; }
	function heron(a, b, c) { var s = (a + b + c) / 2, q = s * (s - a) * (s - b) * (s - c); return q > 0 ? Math.sqrt(q) : 0; }

	var SHAPES = [];
	function def(id, name, dim, inputs, calc, group) { SHAPES.push({ id: id, name: name, dim: dim, inputs: inputs, calc: calc, group: group || "" }); }

	/* ---------- 2D ---------- */
	def("square", "Square", 2, [["a", "Side a"]], function (v) { if (!need(v, ["a"])) return null; return [R("Area", v.a * v.a, "area", "A = a²"), R("Perimeter", 4 * v.a, "len", "P = 4a"), R("Diagonal", v.a * Math.SQRT2, "len", "d = a√2")]; });
	def("rectangle", "Rectangle", 2, [["a", "Length a"], ["b", "Width b"]], function (v) { if (!need(v, ["a", "b"])) return null; return [R("Area", v.a * v.b, "area", "A = a × b"), R("Perimeter", 2 * (v.a + v.b), "len", "P = 2(a + b)"), R("Diagonal", Math.hypot(v.a, v.b), "len", "d = √(a² + b²)")]; });
	def("triangle", "Triangle (3 sides)", 2, [["a", "Side a"], ["b", "Side b"], ["c", "Side c"]], function (v) {
		if (!need(v, ["a", "b", "c"])) return null;
		if (v.a + v.b <= v.c || v.a + v.c <= v.b || v.b + v.c <= v.a) return { error: "These three sides cannot make a triangle: each side must be shorter than the other two added together." };
		var A = heron(v.a, v.b, v.c), p = v.a + v.b + v.c, s = p / 2;
		return [R("Area", A, "area", "Heron: A = √(s(s−a)(s−b)(s−c)), s = " + trim(s, 4)), R("Perimeter", p, "len", "P = a + b + c"), R("Inradius", A / s, "len", "r = A / s"), R("Circumradius", v.a * v.b * v.c / (4 * A), "len", "R = abc / 4A"), R("Height on side a", 2 * A / v.a, "len", "h = 2A / a")];
	});
	def("triangle-bh", "Triangle (base and height)", 2, [["b", "Base b"], ["h", "Height h"]], function (v) { if (!need(v, ["b", "h"])) return null; return [R("Area", v.b * v.h / 2, "area", "A = ½ × b × h")]; });
	def("circle", "Circle", 2, [["r", "Radius r"]], function (v) { if (!need(v, ["r"])) return null; return [R("Area", PI * v.r * v.r, "area", "A = πr²"), R("Circumference", 2 * PI * v.r, "len", "C = 2πr"), R("Diameter", 2 * v.r, "len", "d = 2r")]; });
	def("ellipse", "Ellipse", 2, [["a", "Semi-axis a"], ["b", "Semi-axis b"]], function (v) {
		if (!need(v, ["a", "b"])) return null; var h = Math.pow((v.a - v.b) / (v.a + v.b), 2), P = PI * (v.a + v.b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
		return [R("Area", PI * v.a * v.b, "area", "A = πab"), R("Perimeter (Ramanujan)", P, "len", "P ≈ π(a+b)(1 + 3h/(10+√(4−3h))), h = ((a−b)/(a+b))²")];
	});
	def("trapezoid", "Trapezoid", 2, [["a", "Parallel side a"], ["b", "Parallel side b"], ["h", "Height h"]], function (v) { if (!need(v, ["a", "b", "h"])) return null; return [R("Area", (v.a + v.b) / 2 * v.h, "area", "A = ½(a + b)h"), R("Midline", (v.a + v.b) / 2, "len", "m = (a + b) / 2")]; });
	def("parallelogram", "Parallelogram", 2, [["b", "Base b"], ["h", "Height h"], ["s", "Slanted side s (optional)"]], function (v) {
		if (!need(v, ["b", "h"])) return null; var out = [R("Area", v.b * v.h, "area", "A = b × h")]; if (v.s > 0) { if (v.s < v.h) return { error: "The slanted side cannot be shorter than the height." }; out.push(R("Perimeter", 2 * (v.b + v.s), "len", "P = 2(b + s)")); out.push(R("Angle at the base", Math.asin(v.h / v.s) * 180 / PI, "angle", "θ = asin(h / s)")); } return out;
	});
	def("rhombus", "Rhombus", 2, [["p", "Diagonal p"], ["q", "Diagonal q"]], function (v) { if (!need(v, ["p", "q"])) return null; var s = Math.hypot(v.p, v.q) / 2; return [R("Area", v.p * v.q / 2, "area", "A = pq / 2"), R("Side", s, "len", "a = ½√(p² + q²)"), R("Perimeter", 4 * s, "len", "P = 4a")]; });
	def("regular-polygon", "Regular polygon", 2, [["n", "Number of sides n"], ["a", "Side length a"]], function (v) {
		if (!(v.n >= 3) || Math.floor(v.n) !== v.n || v.n > 1000) return { error: "A polygon needs a whole number of sides, at least 3." }; if (!need(v, ["a"])) return null;
		var ap = v.a / (2 * Math.tan(PI / v.n)); return [R("Area", v.n * v.a * ap / 2, "area", "A = n a² / (4 tan(π/n))"), R("Perimeter", v.n * v.a, "len", "P = n a"), R("Apothem", ap, "len", "r = a / (2 tan(π/n))"), R("Circumradius", v.a / (2 * Math.sin(PI / v.n)), "len", "R = a / (2 sin(π/n))"), R("Interior angle", (v.n - 2) * 180 / v.n, "angle", "(n − 2) × 180° / n")];
	});
	def("sector", "Circle sector", 2, [["r", "Radius r"], ["t", "Angle θ (degrees)"]], function (v) {
		if (!need(v, ["r", "t"])) return null; if (v.t > 360) return { error: "The angle must be 360° or less." }; var th = v.t * PI / 180;
		return [R("Area", v.r * v.r * th / 2, "area", "A = ½r²θ"), R("Arc length", v.r * th, "len", "L = rθ"), R("Perimeter", v.r * th + 2 * v.r, "len", "P = rθ + 2r"), R("Chord", 2 * v.r * Math.sin(th / 2), "len", "c = 2r sin(θ/2)")];
	});
	def("annulus", "Ring (annulus)", 2, [["R", "Outer radius R"], ["r", "Inner radius r"]], function (v) {
		if (!need(v, ["R", "r"])) return null; if (v.r >= v.R) return { error: "The inner radius must be smaller than the outer radius." };
		return [R("Area", PI * (v.R * v.R - v.r * v.r), "area", "A = π(R² − r²)"), R("Outer circumference", 2 * PI * v.R, "len", "2πR"), R("Inner circumference", 2 * PI * v.r, "len", "2πr")];
	});

	/* ---------- 3D ---------- */
	def("cube", "Cube", 3, [["a", "Edge a"]], function (v) { if (!need(v, ["a"])) return null; return [R("Volume", Math.pow(v.a, 3), "vol", "V = a³"), R("Surface area", 6 * v.a * v.a, "area", "S = 6a²"), R("Face diagonal", v.a * Math.SQRT2, "len", "a√2"), R("Space diagonal", v.a * Math.sqrt(3), "len", "a√3")]; }, "Boxes and prisms");
	def("box", "Rectangular box", 3, [["a", "Length a"], ["b", "Width b"], ["c", "Height c"]], function (v) { if (!need(v, ["a", "b", "c"])) return null; return [R("Volume", v.a * v.b * v.c, "vol", "V = abc"), R("Surface area", 2 * (v.a * v.b + v.b * v.c + v.a * v.c), "area", "S = 2(ab + bc + ac)"), R("Space diagonal", Math.sqrt(v.a * v.a + v.b * v.b + v.c * v.c), "len", "d = √(a² + b² + c²)")]; }, "Boxes and prisms");
	def("prism", "Triangular prism", 3, [["a", "Triangle side a"], ["b", "Triangle side b"], ["c", "Triangle side c"], ["l", "Prism length l"]], function (v) {
		if (!need(v, ["a", "b", "c", "l"])) return null; if (v.a + v.b <= v.c || v.a + v.c <= v.b || v.b + v.c <= v.a) return { error: "The three triangle sides cannot make a triangle." };
		var A = heron(v.a, v.b, v.c); return [R("Volume", A * v.l, "vol", "V = (triangle area) × l"), R("Surface area", 2 * A + (v.a + v.b + v.c) * v.l, "area", "S = 2 × (triangle area) + (a + b + c) l"), R("Triangle area", A, "area", "Heron's formula")];
	}, "Boxes and prisms");
	def("cylinder", "Cylinder", 3, [["r", "Radius r"], ["h", "Height h"]], function (v) { if (!need(v, ["r", "h"])) return null; return [R("Volume", PI * v.r * v.r * v.h, "vol", "V = πr²h"), R("Surface area", 2 * PI * v.r * (v.r + v.h), "area", "S = 2πr(r + h)"), R("Lateral area", 2 * PI * v.r * v.h, "area", "L = 2πrh"), R("Base area", PI * v.r * v.r, "area", "B = πr²")]; }, "Round shapes");
	def("cone", "Cone", 3, [["r", "Radius r"], ["h", "Height h"]], function (v) { if (!need(v, ["r", "h"])) return null; var s = Math.hypot(v.r, v.h); return [R("Volume", PI * v.r * v.r * v.h / 3, "vol", "V = ⅓πr²h"), R("Surface area", PI * v.r * (v.r + s), "area", "S = πr(r + s)"), R("Lateral area", PI * v.r * s, "area", "L = πrs"), R("Slant height", s, "len", "s = √(r² + h²)")]; }, "Round shapes");
	def("frustum", "Cone frustum", 3, [["R", "Bottom radius R"], ["r", "Top radius r"], ["h", "Height h"]], function (v) {
		if (!need(v, ["R", "r", "h"])) return null; var s = Math.sqrt(v.h * v.h + Math.pow(v.R - v.r, 2));
		return [R("Volume", PI * v.h / 3 * (v.R * v.R + v.R * v.r + v.r * v.r), "vol", "V = ⅓πh(R² + Rr + r²)"), R("Surface area", PI * (v.R * v.R + v.r * v.r + (v.R + v.r) * s), "area", "S = π(R² + r² + (R + r)s)"), R("Slant height", s, "len", "s = √(h² + (R − r)²)")];
	}, "Round shapes");
	def("sphere", "Sphere", 3, [["r", "Radius r"]], function (v) { if (!need(v, ["r"])) return null; return [R("Volume", 4 / 3 * PI * Math.pow(v.r, 3), "vol", "V = ⁴⁄₃πr³"), R("Surface area", 4 * PI * v.r * v.r, "area", "S = 4πr²"), R("Great-circle circumference", 2 * PI * v.r, "len", "C = 2πr")]; }, "Round shapes");
	def("hemisphere", "Hemisphere", 3, [["r", "Radius r"]], function (v) { if (!need(v, ["r"])) return null; return [R("Volume", 2 / 3 * PI * Math.pow(v.r, 3), "vol", "V = ⅔πr³"), R("Curved surface", 2 * PI * v.r * v.r, "area", "2πr²"), R("Total surface (with base)", 3 * PI * v.r * v.r, "area", "S = 3πr²")]; }, "Round shapes");
	def("capsule", "Capsule (pill)", 3, [["r", "Radius r"], ["h", "Straight part h (0 = sphere)"]], function (v) { if (!(v.r > 0) || !(v.h >= 0)) return null; return [R("Volume", PI * v.r * v.r * v.h + 4 / 3 * PI * Math.pow(v.r, 3), "vol", "V = πr²h + ⁴⁄₃πr³"), R("Surface area", 2 * PI * v.r * v.h + 4 * PI * v.r * v.r, "area", "S = 2πrh + 4πr²")]; }, "Round shapes");
	def("ellipsoid", "Ellipsoid", 3, [["a", "Semi-axis a"], ["b", "Semi-axis b"], ["c", "Semi-axis c"]], function (v) {
		if (!need(v, ["a", "b", "c"])) return null; var p = 1.6075, S = 4 * PI * Math.pow((Math.pow(v.a * v.b, p) + Math.pow(v.a * v.c, p) + Math.pow(v.b * v.c, p)) / 3, 1 / p);
		return [R("Volume", 4 / 3 * PI * v.a * v.b * v.c, "vol", "V = ⁴⁄₃πabc"), R("Surface area (Knud Thomsen, ±1%)", S, "area", "S ≈ 4π((aᵖbᵖ + aᵖcᵖ + bᵖcᵖ)/3)^(1/p), p = 1.6075")];
	}, "Round shapes");
	def("torus", "Torus (donut)", 3, [["R", "Ring radius R (centre to tube centre)"], ["r", "Tube radius r"]], function (v) {
		if (!need(v, ["R", "r"])) return null; if (v.r > v.R) return { error: "For a ring torus the tube radius r cannot be larger than R." };
		return [R("Volume", 2 * PI * PI * v.R * v.r * v.r, "vol", "V = 2π²Rr²"), R("Surface area", 4 * PI * PI * v.R * v.r, "area", "S = 4π²Rr")];
	}, "Round shapes");
	def("pyramid", "Square pyramid", 3, [["a", "Base side a"], ["h", "Height h"]], function (v) { if (!need(v, ["a", "h"])) return null; var sl = Math.sqrt(v.h * v.h + v.a * v.a / 4); return [R("Volume", v.a * v.a * v.h / 3, "vol", "V = ⅓a²h"), R("Surface area", v.a * v.a + 2 * v.a * sl, "area", "S = a² + 2a·s"), R("Slant height", sl, "len", "s = √(h² + (a/2)²)"), R("Lateral edge", Math.sqrt(sl * sl + v.a * v.a / 4), "len", "√(s² + (a/2)²)")]; }, "Pyramids");
	def("rect-pyramid", "Rectangular pyramid", 3, [["a", "Base length a"], ["b", "Base width b"], ["h", "Height h"]], function (v) {
		if (!need(v, ["a", "b", "h"])) return null; var s1 = Math.sqrt(v.h * v.h + v.b * v.b / 4), s2 = Math.sqrt(v.h * v.h + v.a * v.a / 4);
		return [R("Volume", v.a * v.b * v.h / 3, "vol", "V = ⅓abh"), R("Surface area", v.a * v.b + v.a * s1 + v.b * s2, "area", "S = ab + a·s₁ + b·s₂")];
	}, "Pyramids");
	def("tetrahedron", "Regular tetrahedron", 3, [["a", "Edge a"]], function (v) { if (!need(v, ["a"])) return null; return [R("Volume", Math.pow(v.a, 3) / (6 * Math.SQRT2), "vol", "V = a³ / (6√2)"), R("Surface area", Math.sqrt(3) * v.a * v.a, "area", "S = √3 a²"), R("Height", v.a * Math.sqrt(2 / 3), "len", "h = a√(2/3)")]; }, "Pyramids");
	def("octahedron", "Regular octahedron", 3, [["a", "Edge a"]], function (v) { if (!need(v, ["a"])) return null; return [R("Volume", Math.SQRT2 / 3 * Math.pow(v.a, 3), "vol", "V = (√2/3)a³"), R("Surface area", 2 * Math.sqrt(3) * v.a * v.a, "area", "S = 2√3 a²")]; }, "Pyramids");

	function byId(id) { for (var i = 0; i < SHAPES.length; i++) if (SHAPES[i].id === id) return SHAPES[i]; return null; }
	// values = { key: "text" } in the user's unit; returns { ok, error, results:[{label, value, kind, formula}] } (empty fields -> null)
	function compute(id, values) {
		var S = byId(id); if (!S) return { ok: false, error: "Unknown shape." }; var v = {}, any = false;
		S.inputs.forEach(function (inp) { var n = num(values[inp[0]]); v[inp[0]] = n == null ? NaN : n; if (n != null) any = true; });
		var r = S.calc(v); if (r == null) return { ok: false, error: "" }; if (r.error) return { ok: false, error: r.error };
		return { ok: true, results: r.map(function (x) { return { label: x[0], value: x[1], kind: x[2], formula: x[3] }; }) };
	}
	// reverse: given a shape with one scalable size (all lengths scale by k), the factor that gives a target volume / area
	function scaleFor(id, values, kind, target) {
		var base = compute(id, values); if (!base.ok) return null; var res = base.results.filter(function (x) { return x.kind === kind; })[0]; if (!res || !(res.value > 0) || !(target > 0)) return null;
		return Math.pow(target / res.value, 1 / (kind === "vol" ? 3 : 2));
	}
	var SH = { num: num, fix: fix, trim: trim, pretty: pretty, UNITS: UNITS, UNIT_ORDER: UNIT_ORDER, UNIT_NAMES: UNIT_NAMES, sup: sup, convert: convert, capacity: capacity, areaUnits: areaUnits, SHAPES: SHAPES, byId: byId, compute: compute, scaleFor: scaleFor, heron: heron };
	if (typeof module !== "undefined" && module.exports) module.exports = SH; else root.SH = SH;
})(typeof window !== "undefined" ? window : this);

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
