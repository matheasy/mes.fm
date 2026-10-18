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
