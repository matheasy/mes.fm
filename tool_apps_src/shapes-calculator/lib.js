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
