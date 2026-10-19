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


	/* ---------- 3D meshes (for the viewer; y is up, closed surfaces with outward normals) ---------- */
	function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
	function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
	function meshOut() { return { verts: [], tris: [], lines: [], wire: [] }; }
	// a convex flat face given as a vertex-index loop; oriented outward away from `inside`
	function addFace(M, idx, inside) {
		var v = M.verts, n = cross(sub(v[idx[1]], v[idx[0]]), sub(v[idx[2]], v[idx[0]])), c = [0, 0, 0]; idx.forEach(function (i) { c[0] += v[i][0] / idx.length; c[1] += v[i][1] / idx.length; c[2] += v[i][2] / idx.length; });
		if (dot(n, sub(c, inside)) < 0) idx = idx.slice().reverse();
		for (var k = 1; k < idx.length - 1; k++) M.tris.push([idx[0], idx[k], idx[k + 1]]);
		for (var e = 0; e < idx.length; e++) M.wire.push([idx[e], idx[(e + 1) % idx.length]]);
	}
	function revolve(profile, n) {
		var M = meshOut(), K = profile.length, i, j;
		for (i = 0; i < K; i++) for (j = 0; j < n; j++) { var th = 2 * PI * j / n; M.verts.push([profile[i][0] * Math.cos(th), profile[i][1], profile[i][0] * Math.sin(th)]); }
		var id = function (a, b) { return a * n + (b % n); };
		for (i = 0; i < K - 1; i++) for (j = 0; j < n; j++) { var A = id(i, j), B = id(i + 1, j), C = id(i + 1, j + 1), D = id(i, j + 1); M.tris.push([A, B, C]); M.tris.push([A, C, D]); }
		for (i = 1; i < K - 1 || i === 1; i++) { if (i >= K) break; var ring = []; for (j = 0; j <= n; j++) ring.push(id(i, j)); M.wire.push(ring); }
		var step = Math.max(1, Math.round(n / 16)); for (j = 0; j < n; j += step) { var mer = []; for (i = 0; i < K; i++) mer.push(id(i, j)); M.wire.push(mer); }
		return M;
	}
	function arcPts(cx, cy, r, a0, a1, k) { var o = []; for (var i = 0; i <= k; i++) { var a = a0 + (a1 - a0) * i / k; o.push([r * Math.cos(a), cy + r * Math.sin(a)]); } return o; }   // (r, y) pairs around (0, cy)
	function lineSeg(M, p, q, t) { M.lines.push({ a: p, b: q, t: t }); }
		// flat shapes as meshes in the z = 0 plane (counter-clockwise, normal +z) for the scale-drawing viewer
	function flatMesh(id, v, n) {
		var M = meshOut(), P, i, k;
		function fan(pts) { var b = M.verts.length; pts.forEach(function (p) { M.verts.push([p[0], p[1], 0]); }); for (var q = 1; q < pts.length - 1; q++) M.tris.push([b, b + q, b + q + 1]); var lp = []; for (var e = 0; e <= pts.length; e++) lp.push(b + (e % pts.length)); M.wire.push(lp); }
		function circ(r, a0, a1, m) { var o = []; for (var j = 0; j <= m; j++) { var a = a0 + (a1 - a0) * j / m; o.push([r * Math.cos(a), r * Math.sin(a)]); } return o; }
		switch (id) {
			case "square": k = v.a / 2; fan([[-k, -k], [k, -k], [k, k], [-k, k]]); lineSeg(M, [-k, -k, 0], [k, -k, 0], "a"); return M;
			case "rectangle": fan([[-v.a / 2, -v.b / 2], [v.a / 2, -v.b / 2], [v.a / 2, v.b / 2], [-v.a / 2, v.b / 2]]); lineSeg(M, [-v.a / 2, -v.b / 2, 0], [v.a / 2, -v.b / 2, 0], "a"); lineSeg(M, [v.a / 2, -v.b / 2, 0], [v.a / 2, v.b / 2, 0], "b"); return M;
			case "triangle": { var ca = (v.b * v.b + v.c * v.c - v.a * v.a) / (2 * v.b * v.c), sa = Math.sqrt(Math.max(0, 1 - ca * ca)), T = [[0, 0], [v.c, 0], [v.b * ca, v.b * sa]], cx = (T[0][0] + T[1][0] + T[2][0]) / 3, cy = (T[0][1] + T[1][1] + T[2][1]) / 3; T = T.map(function (p) { return [p[0] - cx, p[1] - cy]; }); fan(T); lineSeg(M, [T[0][0], T[0][1], 0], [T[1][0], T[1][1], 0], "c"); lineSeg(M, [T[0][0], T[0][1], 0], [T[2][0], T[2][1], 0], "b"); lineSeg(M, [T[1][0], T[1][1], 0], [T[2][0], T[2][1], 0], "a"); return M; }
			case "triangle-bh": fan([[-v.b / 2, -v.h / 2], [v.b / 2, -v.h / 2], [0, v.h / 2]]); lineSeg(M, [-v.b / 2, -v.h / 2, 0], [v.b / 2, -v.h / 2, 0], "b"); lineSeg(M, [0, -v.h / 2, 0], [0, v.h / 2, 0], "h"); return M;
			case "circle": fan(circ(v.r, 0, 2 * PI, n).slice(0, n)); lineSeg(M, [0, 0, 0], [v.r, 0, 0], "r"); return M;
			case "ellipse": fan(circ(1, 0, 2 * PI, n).slice(0, n).map(function (p) { return [p[0] * v.a, p[1] * v.b]; })); lineSeg(M, [0, 0, 0], [v.a, 0, 0], "a"); lineSeg(M, [0, 0, 0], [0, v.b, 0], "b"); return M;
			case "trapezoid": fan([[-v.b / 2, -v.h / 2], [v.b / 2, -v.h / 2], [v.a / 2, v.h / 2], [-v.a / 2, v.h / 2]]); lineSeg(M, [-v.a / 2, v.h / 2, 0], [v.a / 2, v.h / 2, 0], "a"); lineSeg(M, [-v.b / 2, -v.h / 2, 0], [v.b / 2, -v.h / 2, 0], "b"); lineSeg(M, [0, -v.h / 2, 0], [0, v.h / 2, 0], "h"); return M;
			case "parallelogram": { var sk = v.s > v.h ? Math.sqrt(v.s * v.s - v.h * v.h) : v.h * 0.5; fan([[-v.b / 2 - sk / 2, -v.h / 2], [v.b / 2 - sk / 2, -v.h / 2], [v.b / 2 + sk / 2, v.h / 2], [-v.b / 2 + sk / 2, v.h / 2]]); lineSeg(M, [-v.b / 2 - sk / 2, -v.h / 2, 0], [v.b / 2 - sk / 2, -v.h / 2, 0], "b"); lineSeg(M, [v.b / 2 - sk / 2, -v.h / 2, 0], [v.b / 2 - sk / 2, v.h / 2, 0], "h"); return M; }
			case "rhombus": fan([[v.p / 2, 0], [0, v.q / 2], [-v.p / 2, 0], [0, -v.q / 2]]); lineSeg(M, [-v.p / 2, 0, 0], [v.p / 2, 0, 0], "p"); lineSeg(M, [0, -v.q / 2, 0], [0, v.q / 2, 0], "q"); return M;
			case "regular-polygon": { var Rc = v.a / (2 * Math.sin(PI / v.n)); P = []; for (i = 0; i < v.n; i++) { var an = -PI / 2 - PI / v.n + 2 * PI * i / v.n; P.push([Rc * Math.cos(an), Rc * Math.sin(an)]); } fan(P); lineSeg(M, [P[0][0], P[0][1], 0], [P[1][0], P[1][1], 0], "a"); return M; }
			case "sector": { var th = v.t * PI / 180; P = [[0, 0]].concat(circ(v.r, 0, th, Math.max(8, Math.round(n * th / (2 * PI))))); fan(P); lineSeg(M, [0, 0, 0], [v.r, 0, 0], "r"); return M; }
			case "annulus": { var o = circ(v.R, 0, 2 * PI, n).slice(0, n), inn = circ(v.r, 0, 2 * PI, n).slice(0, n); o.forEach(function (p) { M.verts.push([p[0], p[1], 0]); }); inn.forEach(function (p) { M.verts.push([p[0], p[1], 0]); }); for (i = 0; i < n; i++) { var j = (i + 1) % n; M.tris.push([i, j, n + j]); M.tris.push([i, n + j, n + i]); } var w1 = [], w2 = []; for (i = 0; i <= n; i++) { w1.push(i % n); w2.push(n + (i % n)); } M.wire.push(w1); M.wire.push(w2); lineSeg(M, [0, 0, 0], [v.R, 0, 0], "R"); lineSeg(M, [0, 0, 0], [0, v.r, 0], "r"); return M; }
		}
		return null;
	}
	function mesh(id, v, n) {
		var fm = flatMesh(id, v, n || 64); if (fm) return fm;
		n = n || 64; var M, h, i, j;
		function box(a, b, c) {
			M = meshOut(); var x = a / 2, y = c / 2, z = b / 2; M.verts = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
			[[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [3, 2, 6, 7], [0, 3, 7, 4], [1, 2, 6, 5]].forEach(function (f) { addFace(M, f, [0, 0, 0]); }); return M;
		}
		switch (id) {
			case "cube": M = box(v.a, v.a, v.a); lineSeg(M, [-v.a / 2, -v.a / 2, v.a / 2], [v.a / 2, -v.a / 2, v.a / 2], "a"); return M;
			case "box": M = box(v.a, v.b, v.c); lineSeg(M, [-v.a / 2, -v.c / 2, v.b / 2], [v.a / 2, -v.c / 2, v.b / 2], "a"); lineSeg(M, [v.a / 2, -v.c / 2, v.b / 2], [v.a / 2, -v.c / 2, -v.b / 2], "b"); lineSeg(M, [-v.a / 2, -v.c / 2, v.b / 2], [-v.a / 2, v.c / 2, v.b / 2], "c"); return M;
			case "prism": {
				M = meshOut(); var a = v.a, b = v.b, c = v.c, ca = (b * b + c * c - a * a) / (2 * b * c), sa = Math.sqrt(Math.max(0, 1 - ca * ca)), P = [[0, 0], [c, 0], [b * ca, b * sa]], cx = (P[0][0] + P[1][0] + P[2][0]) / 3, cy = (P[0][1] + P[1][1] + P[2][1]) / 3, l = v.l;
				for (i = 0; i < 3; i++) M.verts.push([P[i][0] - cx, P[i][1] - cy, -l / 2]); for (i = 0; i < 3; i++) M.verts.push([P[i][0] - cx, P[i][1] - cy, l / 2]);
				[[0, 1, 2], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]].forEach(function (f) { addFace(M, f, [0, 0, 0]); }); lineSeg(M, M.verts[3], M.verts[0], "l"); return M;
			}
			case "cylinder": M = revolve([[0, -v.h / 2], [v.r, -v.h / 2], [v.r, v.h / 2], [0, v.h / 2]], n); lineSeg(M, [0, v.h / 2, 0], [v.r, v.h / 2, 0], "r"); lineSeg(M, [v.r, v.h / 2, 0], [v.r, -v.h / 2, 0], "h"); return M;
			case "cone": M = revolve([[0, -v.h / 2], [v.r, -v.h / 2], [0, v.h / 2]], n); lineSeg(M, [0, -v.h / 2, 0], [v.r, -v.h / 2, 0], "r"); lineSeg(M, [0, -v.h / 2, 0], [0, v.h / 2, 0], "h"); return M;
			case "frustum": M = revolve([[0, -v.h / 2], [v.R, -v.h / 2], [v.r, v.h / 2], [0, v.h / 2]], n); lineSeg(M, [0, -v.h / 2, 0], [v.R, -v.h / 2, 0], "R"); lineSeg(M, [0, v.h / 2, 0], [v.r, v.h / 2, 0], "r"); lineSeg(M, [0, -v.h / 2, 0], [0, v.h / 2, 0], "h"); return M;
			case "sphere": { var pr = []; for (i = 0; i <= n / 2; i++) { var f = PI * i / (n / 2); pr.push([v.r * Math.sin(f), -v.r * Math.cos(f)]); } M = revolve(pr, n); lineSeg(M, [0, 0, 0], [v.r, 0, 0], "r"); return M; }
			case "hemisphere": { var ph = [[0, 0], [v.r, 0]]; arcPts(0, 0, v.r, 0, PI / 2, n / 4).forEach(function (q, k) { if (k > 0) ph.push(q); }); M = revolve(ph, n); lineSeg(M, [0, 0, 0], [v.r, 0, 0], "r"); return M; }
			case "capsule": { var pc = arcPts(0, -v.h / 2, v.r, -PI / 2, 0, n / 4).map(function (q) { return [q[0], q[1]]; }).concat(arcPts(0, v.h / 2, v.r, 0, PI / 2, n / 4).slice(1)); M = revolve([[0, -v.h / 2 - v.r]].concat(pc.slice(1)), n); lineSeg(M, [v.r, v.h / 2, 0], [v.r, -v.h / 2, 0], "h"); lineSeg(M, [0, v.h / 2, 0], [v.r, v.h / 2, 0], "r"); return M; }
			case "ellipsoid": { var pe = []; for (i = 0; i <= n / 2; i++) { var g = PI * i / (n / 2); pe.push([Math.sin(g), -Math.cos(g)]); } M = revolve(pe, n); M.verts = M.verts.map(function (p) { return [p[0] * v.a, p[1] * v.b, p[2] * v.c]; }); lineSeg(M, [0, 0, 0], [v.a, 0, 0], "a"); lineSeg(M, [0, 0, 0], [0, v.b, 0], "b"); lineSeg(M, [0, 0, 0], [0, 0, v.c], "c"); return M; }
			case "torus": {
				M = meshOut(); var m = n, k2 = Math.round(n / 2), idt = function (a, b) { return (a % m) * k2 + (b % k2); };
				for (i = 0; i < m; i++) for (j = 0; j < k2; j++) { var u = 2 * PI * i / m, w = 2 * PI * j / k2; M.verts.push([(v.R + v.r * Math.cos(w)) * Math.cos(u), v.r * Math.sin(w), (v.R + v.r * Math.cos(w)) * Math.sin(u)]); }
				for (i = 0; i < m; i++) for (j = 0; j < k2; j++) { var A = idt(i, j), B = idt(i + 1, j), C = idt(i + 1, j + 1), D = idt(i, j + 1); M.tris.push([A, D, C]); M.tris.push([A, C, B]); }
				for (j = 0; j < k2; j += Math.max(1, Math.round(k2 / 6))) { var rg = []; for (i = 0; i <= m; i++) rg.push(idt(i, j)); M.wire.push(rg); } for (i = 0; i < m; i += Math.max(1, Math.round(m / 16))) { var mr = []; for (j = 0; j <= k2; j++) mr.push(idt(i, j)); M.wire.push(mr); }
				lineSeg(M, [0, 0, 0], [v.R, 0, 0], "R"); lineSeg(M, [v.R, 0, 0], [v.R + v.r, 0, 0], "r"); return M;
			}
			case "pyramid": case "rect-pyramid": {
				M = meshOut(); var pa = v.a, pb = id === "pyramid" ? v.a : v.b, ph2 = v.h; M.verts = [[-pa / 2, -ph2 / 2, -pb / 2], [pa / 2, -ph2 / 2, -pb / 2], [pa / 2, -ph2 / 2, pb / 2], [-pa / 2, -ph2 / 2, pb / 2], [0, ph2 / 2, 0]]; var ins = [0, -ph2 / 4, 0];
				addFace(M, [0, 1, 2, 3], ins); [[0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]].forEach(function (f) { addFace(M, f, ins); }); lineSeg(M, [-pa / 2, -ph2 / 2, pb / 2], [pa / 2, -ph2 / 2, pb / 2], "a"); if (id === "rect-pyramid") lineSeg(M, [pa / 2, -ph2 / 2, pb / 2], [pa / 2, -ph2 / 2, -pb / 2], "b"); lineSeg(M, [0, -ph2 / 2, 0], [0, ph2 / 2, 0], "h"); return M;
			}
			case "tetrahedron": { M = meshOut(); var q = v.a / (2 * Math.SQRT2); M.verts = [[q, q, q], [q, -q, -q], [-q, q, -q], [-q, -q, q]]; [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]].forEach(function (f) { addFace(M, f, [0, 0, 0]); }); lineSeg(M, M.verts[1], M.verts[2], "a"); return M; }
			case "octahedron": { M = meshOut(); var o = v.a / Math.SQRT2; M.verts = [[o, 0, 0], [-o, 0, 0], [0, o, 0], [0, -o, 0], [0, 0, o], [0, 0, -o]]; [[0, 2, 4], [0, 2, 5], [0, 3, 4], [0, 3, 5], [1, 2, 4], [1, 2, 5], [1, 3, 4], [1, 3, 5]].forEach(function (f) { addFace(M, f, [0, 0, 0]); }); lineSeg(M, M.verts[0], M.verts[2], "a"); return M; }
		}
		return null;
	}
	function meshVolume(M) { var s = 0; M.tris.forEach(function (t) { var a = M.verts[t[0]], b = M.verts[t[1]], c = M.verts[t[2]]; s += dot(a, cross(b, c)) / 6; }); return s; }
	function meshArea(M) { var s = 0; M.tris.forEach(function (t) { var a = M.verts[t[0]], b = M.verts[t[1]], c = M.verts[t[2]], x = cross(sub(b, a), sub(c, a)); s += Math.sqrt(dot(x, x)) / 2; }); return s; }

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
	var SH = { num: num, fix: fix, trim: trim, pretty: pretty, UNITS: UNITS, UNIT_ORDER: UNIT_ORDER, UNIT_NAMES: UNIT_NAMES, sup: sup, convert: convert, capacity: capacity, areaUnits: areaUnits, SHAPES: SHAPES, byId: byId, compute: compute, scaleFor: scaleFor, heron: heron, mesh: mesh, meshVolume: meshVolume, meshArea: meshArea };
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
		trapezoid: function () { return pg([[55, 35], [145, 35], [180, 115], [20, 115]]) + ln([145, 35], [145, 115], "sh-hid") + tx("a", 100, 28) + tx("b", 100, 138) + tx("h", 134, 80); },
		parallelogram: function () { return pg([[65, 35], [185, 35], [145, 115], [25, 115]]) + ln([65, 35], [65, 115], "sh-hid") + tx("b", 105, 138) + tx("h", 77, 80) + tx("s", 24, 70); },
		rhombus: function () { return pg([[100, 15], [175, 75], [100, 135], [25, 75]]) + ln([25, 75], [175, 75], "sh-hid") + ln([100, 15], [100, 135], "sh-hid") + tx("p", 140, 70) + tx("q", 112, 45); },
		"regular-polygon": function () { return pg([[100, 7], [170, 58], [143, 130], [57, 130], [30, 58]]) + tx("a", 100, 144); },
		sector: function () { return '<path class="sh-fill" d="M40,125 L150,125 A110,110 0 0 0 118.5,47.1 Z"/>' + tx("r", 95, 142) + tx("θ", 80, 113); },
		annulus: function () { return el(100, 75, 62, 62) + el(100, 75, 32, 32, "sh-fill") + ln([100, 75], [162, 75], "sh-hid") + ln([100, 75], [100 - 22.6, 75 - 22.6], "sh-hid") + tx("R", 140, 68) + tx("r", 88, 70); },
		cube: function () { return pg([[70, 40], [150, 40], [150, 120], [70, 120]], "sh-hid") + pg([[40, 55], [120, 55], [150, 40], [70, 40]]) + pg([[40, 55], [120, 55], [120, 135], [40, 135]]) + pg([[120, 55], [150, 40], [150, 120], [120, 135]]) + tx("a", 80, 150) + tx("a", 30, 98); },
		box: function () { return pg([[40, 55], [150, 55], [180, 35], [70, 35]]) + pg([[40, 55], [150, 55], [150, 125], [40, 125]]) + pg([[150, 55], [180, 35], [180, 105], [150, 125]]) + tx("a", 95, 142) + tx("b", 187, 28) + tx("c", 28, 94); },
		prism: function () { return pg([[30, 120], [100, 120], [65, 55]]) + pg([[30, 120], [100, 120], [170, 95], [100, 95]], "sh-fill") + pg([[100, 120], [170, 95], [135, 30], [65, 55]], "sh-fill") + pg([[30, 120], [100, 120], [65, 55]]) + tx("l", 154, 121) + tx("a", 65, 140) + tx("b", 94, 82) + tx("c", 36, 84); },
		cylinder: function () { return '<path class="sh-fill" d="M50,32 L50,118 A50,14 0 0 0 150,118 L150,32 Z"/>' + el(100, 32, 50, 14) + ln([100, 32], [150, 32], "sh-dim") + ln([172, 32], [172, 118], "sh-dim") + tx("r", 162, 24) + tx("h", 186, 80); },
		cone: function () { return '<path class="sh-fill" d="M100,15 L40,112 A60,15 0 0 0 160,112 Z"/>' + ln([100, 15], [100, 112], "sh-hid") + ln([100, 112], [160, 112], "sh-dim") + tx("h", 110, 66) + tx("r", 130, 100); },
		frustum: function () { return '<path class="sh-fill" d="M70,30 L30,115 A70,16 0 0 0 170,115 L130,30 Z"/>' + el(100, 30, 30, 8) + ln([100, 30], [130, 30], "sh-dim") + ln([100, 115], [170, 115], "sh-dim") + ln([100, 30], [100, 115], "sh-hid") + tx("r", 118, 14) + tx("R", 136, 132) + tx("h", 112, 78); },
		sphere: function () { return el(100, 75, 60, 60) + arc(100, 75, 60, 16, "sh-hid", false) + arc(100, 75, 60, 16, "sh-line", true) + ln([100, 75], [160, 75], "sh-dim") + tx("r", 130, 68); },
		hemisphere: function () { return '<path class="sh-fill" d="M35,95 A65,65 0 0 1 165,95 Z"/>' + el(100, 95, 65, 16) + ln([100, 95], [165, 95], "sh-dim") + tx("r", 178, 92); },
		capsule: function () { return '<path class="sh-fill" d="M70,25 A30,30 0 0 0 40,55 L40,95 A30,30 0 0 0 100,95 L100,55 A30,30 0 0 0 70,25 Z" transform="translate(30,0)"/>' + arc(100, 55, 30, 8, "sh-hid", false) + arc(100, 95, 30, 8, "sh-hid", false) + ln([100, 75], [130, 75], "sh-dim") + ln([150, 55], [150, 95], "sh-dim") + tx("r", 116, 69) + tx("h", 164, 80); },
		ellipsoid: function () { return el(100, 75, 80, 50) + arc(100, 75, 80, 16, "sh-hid", false) + arc(100, 75, 80, 16, "sh-line", true) + ln([100, 75], [180, 75], "sh-dim") + ln([100, 75], [100, 25], "sh-dim") + ln([100, 75], [70, 90], "sh-dim") + tx("a", 150, 63) + tx("b", 112, 52) + tx("c", 78, 106); },
		torus: function () { return el(100, 75, 80, 48) + el(100, 75, 34, 16, "sh-fill").replace("sh-fill", "sh-hid") + ln([100, 75], [140, 75], "sh-dim") + ln([140, 75], [170, 75], "sh-dim") + tx("R", 120, 68) + tx("r", 158, 68); },
		pyramid: function () { return pg([[100, 15], [30, 120], [150, 120]]) + pg([[100, 15], [150, 120], [185, 90]], "sh-fill") + ln([100, 15], [100, 120], "sh-hid") + ln([30, 120], [65, 90], "sh-hid") + ln([65, 90], [185, 90], "sh-hid") + ln([65, 90], [100, 15], "sh-hid") + tx("h", 90, 76) + tx("a", 90, 140); },
		"rect-pyramid": function () { return pg([[100, 15], [30, 120], [150, 120]]) + pg([[100, 15], [150, 120], [185, 90]], "sh-fill") + ln([100, 15], [100, 120], "sh-hid") + ln([30, 120], [65, 90], "sh-hid") + ln([65, 90], [185, 90], "sh-hid") + ln([65, 90], [100, 15], "sh-hid") + tx("h", 90, 76) + tx("a", 90, 140) + tx("b", 186, 122); },
		tetrahedron: function () { return pg([[100, 15], [30, 120], [165, 120]]) + ln([100, 15], [120, 92], "sh-line") + ln([30, 120], [120, 92], "sh-hid") + ln([165, 120], [120, 92], "sh-hid") + tx("a", 100, 140); },
		octahedron: function () { return pg([[100, 12], [30, 80], [100, 105], [170, 80]]) + pg([[100, 148], [30, 80], [100, 105], [170, 80]], "sh-fill") + ln([30, 80], [170, 80], "sh-hid") + tx("a", 56, 40); }
	};
	var DL = {}; try { DL = JSON.parse(localStorage.getItem(KEY + ":dlab") || "{}") || {}; } catch (e) {}
	function drawPic(id) {
		var f = D[id], n = 0; if (!f) { $("sh-pic").innerHTML = ""; return; }
		var inner = f().replace(/<text /g, function () { var k = id + ":" + n++, o = DL[k]; return '<text data-lb="' + k + '" ' + (o ? 'transform="translate(' + o[0].toFixed(1) + "," + o[1].toFixed(1) + ')" ' : ""); });
		$("sh-pic").innerHTML = '<svg viewBox="0 0 200 150" role="presentation">' + inner + "</svg>";
	}
	(function () {
		var pic = $("sh-pic"), drag = null;
		function pt(e) { var svg = pic.querySelector("svg"), p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
		pic.addEventListener("pointerdown", function (e) { var t = e.target.closest && e.target.closest("[data-lb]"); if (!t) return; var p = pt(e); drag = { id: t.dataset.lb, last: [p.x, p.y] }; try { pic.setPointerCapture(e.pointerId); } catch (x) {} e.preventDefault(); });
		pic.addEventListener("pointermove", function (e) { if (!drag) return; var p = pt(e), o = DL[drag.id] || [0, 0]; DL[drag.id] = [o[0] + p.x - drag.last[0], o[1] + p.y - drag.last[1]]; drag.last = [p.x, p.y]; drawPic(st.s); });
		var end = function () { if (drag) { drag = null; try { localStorage.setItem(KEY + ":dlab", JSON.stringify(DL)); } catch (e) {} } }; pic.addEventListener("pointerup", end); pic.addEventListener("pointercancel", end);
		window.dlReset = function () { DL = {}; try { localStorage.removeItem(KEY + ":dlab"); } catch (e) {} drawPic(st.s); };
	})();

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
		M.verts = M.verts.map(function (p) { return [p[0] * k, p[1] * k, p[2] * k]; }); M.lines.forEach(function (l) { l.a = [l.a[0] * k, l.a[1] * k, l.a[2] * k]; l.b = [l.b[0] * k, l.b[1] * k, l.b[2] * k]; }); V3.mesh = M; v3Draw(); v3Loop(); if (window.slBuild_) slBuild_();
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
	function v3Slide(act, x, y) {
		var o = act.o, dx = act.B0[0] - act.A0[0], dy = act.B0[1] - act.A0[1], ls = act.ls0, L = ((x - act.A0[0]) * dx + (y - act.A0[1]) * dy) / ls, r = 1 + act.gain * (L - ls) / ls;   // always measured from where the drag started, so it can never run away
		r = Math.max(0.2, Math.min(5, r)); var nv = +(act.v0 * r).toPrecision(3), nd = Object.assign({}, V3.dims); nd[o.key] = nv; if (!SH.compute(st.s, nd).ok) return;
		var inp = $("sh-i-" + o.key); if (!inp) return; inp.value = SH.trim(nv, 4); inp.dispatchEvent(new Event("input", { bubbles: true }));
		if (!act.learned && Math.abs(nv - act.v0) / act.v0 > 0.03) {   // some lines grow from one end, some from the middle: learn how far the dot really moves so it follows the pointer
			var hh = V3.hot.filter(function (q) { return q.key === o.key; })[0]; if (hh) { var d1 = ((hh.B[0] - act.B0[0]) * dx + (hh.B[1] - act.B0[1]) * dy) / ls, e1 = (nv - act.v0) / act.v0 * ls; if (Math.abs(d1) > 1) { act.gain = Math.max(0.5, Math.min(4, e1 / d1)); act.learned = true; } }
		}
	}
	(function () {
		var cv = $("sh-cv"); function pos(e) { var r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
		$("sh-3d-mode").addEventListener("click", function (e) { var b = e.target.closest("button"); if (!b) return; V3.mode = b.dataset.m; [].forEach.call(this.children, function (x) { x.setAttribute("aria-pressed", String(x === b)); }); v3Draw(); });
		$("sh-3d-spin").addEventListener("change", function () { V3.spin = this.checked; v3Loop(); }); $("sh-3d-lab").addEventListener("change", function () { V3.labels = this.checked; v3Draw(); });
		$("sh-3d-reset").addEventListener("click", function () { V3.yaw = V3.flat ? 0 : -0.6; V3.pitch = V3.flat ? 0 : 0.42; V3.zoom = 1; V3.off = {}; offSave(); if (window.dlReset) dlReset(); v3Draw(); });
		cv.addEventListener("pointerdown", function (e) { var p = pos(e); V3.ptrs[e.pointerId] = [e.clientX, e.clientY]; try { cv.setPointerCapture(e.pointerId); } catch (x) {} var hit = Object.keys(V3.ptrs).length === 1 ? v3Hit(p[0], p[1]) : null; if (hit) { V3.act = { h: hit, last: p }; if (hit.t === "dim") { var o0 = hit.o; V3.act.o = o0; V3.act.A0 = o0.A.slice(); V3.act.B0 = o0.B.slice(); V3.act.ls0 = Math.hypot(o0.B[0] - o0.A[0], o0.B[1] - o0.A[1]); V3.act.v0 = V3.dims[o0.key]; V3.act.gain = 1; V3.act.learned = false; if (V3.act.ls0 < 28) V3.act = null; else V3.frozen = 1; } e.preventDefault(); return; } V3.act = null; if (!V3.flat) { V3.spin = false; $("sh-3d-spin").checked = false; } });
		cv.addEventListener("pointermove", function (e) {
			var p = pos(e), ids = Object.keys(V3.ptrs);
			if (!ids.length) { var hv = v3Hit(p[0], p[1]); cv.style.cursor = hv ? (hv.t === "dim" ? "ew-resize" : "move") : (V3.flat ? "default" : "grab"); return; }
			if (V3.act) { var a = V3.act; if (a.h.t === "lab") { var of = V3.off[a.h.o.oid] || [0, 0]; V3.off[a.h.o.oid] = [of[0] + p[0] - a.last[0], of[1] + p[1] - a.last[1]]; a.last = p; v3Draw(); } else v3Slide(a, p[0], p[1]); return; }
			var prev = V3.ptrs[e.pointerId]; if (!prev) return; if (ids.length === 2) { V3.ptrs[e.pointerId] = [e.clientX, e.clientY]; var A1 = V3.ptrs[ids[0]], B1 = V3.ptrs[ids[1]], d = Math.hypot(A1[0] - B1[0], A1[1] - B1[1]); if (V3.pinch) V3.zoom = Math.max(0.4, Math.min(3, V3.zoom * d / V3.pinch)); V3.pinch = d; v3Draw(); return; }
			if (!V3.flat) { V3.yaw += (e.clientX - prev[0]) * 0.01; V3.pitch = Math.max(-1.5, Math.min(1.5, V3.pitch + (e.clientY - prev[1]) * 0.01)); } V3.ptrs[e.pointerId] = [e.clientX, e.clientY]; v3Draw();
		});
		var up = function (e) { delete V3.ptrs[e.pointerId]; V3.pinch = 0; if (V3.act) { if (V3.act.h.t === "lab") offSave(); V3.act = null; if (V3.frozen) { V3.frozen = 0; v3Build(); } } }; cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
		cv.addEventListener("wheel", function (e) { e.preventDefault(); V3.zoom = Math.max(0.4, Math.min(3, V3.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1))); v3Draw(); }, { passive: false });
		window.addEventListener("resize", v3Draw); new MutationObserver(v3Draw).observe(document.body, { attributes: true, attributeFilter: ["class"] });
	})();

	/* ---- one slider per dimension under the picture (centred on the current value, one decade either way; the picture re-fits as you slide) ---- */
	var SL = { ref: {}, sliding: null };
	function slDims() { var S = SH.byId(st.s); return S.inputs.filter(function (i) { return i[0] !== "n" && !(S.id === "sector" && i[0] === "t"); }); }
	function slBuild() {
		var box = $("sh-sl"); if (!box || SL.sliding) return; var d = V3.dims || {};
		box.innerHTML = slDims().map(function (i) { var v = d[i[0]]; SL.ref[i[0]] = v; return '<label class="sh-slr"><span class="sh-slk">' + esc(i[0]) + '</span><input type="range" min="-1" max="1" step="0.005" value="0" data-k="' + i[0] + '" aria-label="' + esc(i[1]) + '"><b class="sh-slv" id="sh-slv-' + i[0] + '">' + esc(SH.trim(v, 3)) + " " + esc(st.u) + "</b></label>"; }).join("");
	}
	$("sh-sl").addEventListener("input", function (e) {
		var k = e.target.dataset.k; if (!k) return; var ref = SL.ref[k], v = +(ref * Math.pow(10, +e.target.value)).toPrecision(3), nd = Object.assign({}, V3.dims); nd[k] = v; if (!SH.compute(st.s, nd).ok) return;
		SL.sliding = k; var inp = $("sh-i-" + k); inp.value = SH.trim(v, 4); inp.dispatchEvent(new Event("input", { bubbles: true })); var o = $("sh-slv-" + k); if (o) o.textContent = SH.trim(v, 3) + " " + st.u;
	});
	$("sh-sl").addEventListener("change", function () { SL.sliding = null; slBuild(); });
	window.slBuild_ = slBuild; window.v3Build_ = v3Build; load(); fromUrl(); show();
})();
