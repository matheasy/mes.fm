// node tool_apps_src/shapes-calculator-tests.js
const SH = require("./shapes-calculator/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-9 * Math.max(1, Math.abs(b)) : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
function get(id, v, label) { const r = SH.compute(id, v); if (!r.ok) return null; const x = r.results.filter(q => q.label === label)[0]; return x ? x.value : null; }
eq(SH.num("1,5"), 1.5, "comma"); eq(SH.num("1,000"), 1000, "thousands"); eq(SH.num("abc"), null, "bad"); eq(SH.pretty(1234.5678), "1,234.57", "pretty");
eq(get("square", { a: 5 }, "Area"), 25, "square"); eq(get("rectangle", { a: 3, b: 4 }, "Diagonal"), 5, "3-4-5 diagonal"); eq(get("rectangle", { a: 3, b: 4 }, "Perimeter"), 14, "rect P");
eq(get("triangle", { a: 3, b: 4, c: 5 }, "Area"), 6, "3-4-5 area"); eq(get("triangle", { a: 3, b: 4, c: 5 }, "Circumradius"), 2.5, "right triangle R = c/2"); eq(get("triangle", { a: 3, b: 4, c: 5 }, "Inradius"), 1, "3-4-5 inradius");
eq(SH.compute("triangle", { a: 1, b: 2, c: 3 }).ok, false, "degenerate triangle rejected"); eq(get("triangle-bh", { b: 10, h: 6 }, "Area"), 30, "tri bh");
eq(get("circle", { r: 1 }, "Area"), Math.PI, "unit circle"); eq(get("circle", { r: 2 }, "Circumference"), 4 * Math.PI, "circumference");
eq(get("ellipse", { a: 5, b: 5 }, "Perimeter (Ramanujan)"), 10 * Math.PI, "ellipse = circle"); eq(get("ellipse", { a: 5, b: 3 }, "Perimeter (Ramanujan)"), 25.5269, "ellipse 5x3 (25.5269)", 1e-3);
eq(get("trapezoid", { a: 4, b: 6, h: 3 }, "Area"), 15, "trapezoid"); eq(get("parallelogram", { b: 5, h: 4 }, "Area"), 20, "parallelogram"); eq(get("parallelogram", { b: 5, h: 4, s: 8 }, "Angle at the base"), 30, "angle", 1e-9);
eq(get("rhombus", { p: 6, q: 8 }, "Side"), 5, "rhombus side"); eq(get("rhombus", { p: 6, q: 8 }, "Area"), 24, "rhombus area");
eq(get("regular-polygon", { n: 4, a: 3 }, "Area"), 9, "n=4 is a square"); eq(get("regular-polygon", { n: 6, a: 2 }, "Area"), 6 * Math.sqrt(3), "hexagon", 1e-9); eq(get("regular-polygon", { n: 6, a: 2 }, "Interior angle"), 120, "hexagon angle"); eq(SH.compute("regular-polygon", { n: 2, a: 1 }).ok, false, "n<3");
eq(get("sector", { r: 2, t: 90 }, "Area"), Math.PI, "quarter circle sector"); eq(get("sector", { r: 1, t: 360 }, "Arc length"), 2 * Math.PI, "full arc"); eq(get("sector", { r: 1, t: 180 }, "Chord"), 2, "diameter chord");
eq(get("annulus", { R: 3, r: 2 }, "Area"), 5 * Math.PI, "ring"); eq(SH.compute("annulus", { R: 2, r: 3 }).ok, false, "ring inverted");
eq(get("cube", { a: 2 }, "Volume"), 8, "cube V"); eq(get("cube", { a: 2 }, "Surface area"), 24, "cube S"); eq(get("cube", { a: 1 }, "Space diagonal"), Math.sqrt(3), "cube diag");
eq(get("box", { a: 2, b: 3, c: 4 }, "Volume"), 24, "box V"); eq(get("box", { a: 2, b: 3, c: 4 }, "Surface area"), 52, "box S");
eq(get("prism", { a: 3, b: 4, c: 5, l: 10 }, "Volume"), 60, "prism V"); eq(get("prism", { a: 3, b: 4, c: 5, l: 10 }, "Surface area"), 12 + 120, "prism S");
eq(get("cylinder", { r: 1, h: 1 }, "Volume"), Math.PI, "cyl V"); eq(get("cylinder", { r: 1, h: 1 }, "Surface area"), 4 * Math.PI, "cyl S"); eq(get("cylinder", { r: 3, h: 5 }, "Lateral area"), 30 * Math.PI, "cyl lateral");
eq(get("cone", { r: 3, h: 4 }, "Slant height"), 5, "cone slant"); eq(get("cone", { r: 3, h: 4 }, "Volume"), 12 * Math.PI, "cone V"); eq(get("cone", { r: 3, h: 4 }, "Surface area"), 24 * Math.PI, "cone S");
eq(get("frustum", { R: 2, r: 2, h: 5 }, "Volume"), PI4(2, 5), "frustum with R=r is a cylinder"); function PI4(r, h) { return Math.PI * r * r * h; }
eq(get("frustum", { R: 3, r: 0.0001, h: 4 }, "Volume"), 12 * Math.PI, "frustum -> cone", 5e-3); eq(get("frustum", { R: 4, r: 1, h: 4 }, "Slant height"), 5, "frustum slant 3-4-5");
eq(get("sphere", { r: 1 }, "Volume"), 4 / 3 * Math.PI, "sphere V"); eq(get("sphere", { r: 1 }, "Surface area"), 4 * Math.PI, "sphere S"); eq(get("sphere", { r: 3 }, "Volume"), 36 * Math.PI, "r=3");
eq(get("hemisphere", { r: 3 }, "Total surface (with base)"), 27 * Math.PI, "hemisphere S"); eq(get("hemisphere", { r: 3 }, "Volume"), 18 * Math.PI, "hemisphere V");
eq(get("capsule", { r: 1, h: 0 }, "Volume"), 4 / 3 * Math.PI, "capsule h=0 is a sphere"); eq(get("capsule", { r: 1, h: 0 }, "Surface area"), 4 * Math.PI, "capsule S h=0");
eq(get("ellipsoid", { a: 2, b: 2, c: 2 }, "Volume"), 32 / 3 * Math.PI, "ellipsoid = sphere"); eq(get("ellipsoid", { a: 2, b: 2, c: 2 }, "Surface area (Knud Thomsen, ±1%)"), 16 * Math.PI, "ellipsoid S sphere", 1e-9);
eq(get("ellipsoid", { a: 3, b: 2, c: 1 }, "Surface area (Knud Thomsen, ±1%)"), 48.88, "ellipsoid 3,2,1 about 48.88", 0.2);
eq(get("torus", { R: 3, r: 1 }, "Volume"), 6 * Math.PI * Math.PI, "torus V"); eq(get("torus", { R: 3, r: 1 }, "Surface area"), 12 * Math.PI * Math.PI, "torus S"); eq(SH.compute("torus", { R: 1, r: 2 }).ok, false, "torus invalid");
eq(get("pyramid", { a: 6, h: 4 }, "Volume"), 48, "pyramid V"); eq(get("pyramid", { a: 6, h: 4 }, "Slant height"), 5, "pyramid slant"); eq(get("pyramid", { a: 6, h: 4 }, "Surface area"), 36 + 60, "pyramid S");
eq(get("rect-pyramid", { a: 6, b: 6, h: 4 }, "Surface area"), 96, "rect pyramid with square base"); eq(get("rect-pyramid", { a: 3, b: 4, h: 6 }, "Volume"), 24, "rect pyramid V");
eq(get("tetrahedron", { a: 1 }, "Volume"), 0.11785113019775793, "tetra V"); eq(get("tetrahedron", { a: 2 }, "Surface area"), 4 * Math.sqrt(3), "tetra S"); eq(get("octahedron", { a: 1 }, "Volume"), Math.SQRT2 / 3, "octa V"); eq(get("octahedron", { a: 1 }, "Surface area"), 2 * Math.sqrt(3), "octa S");
// units
eq(SH.convert(1, 1, "m", "cm"), 100, "m to cm"); eq(SH.convert(1, 2, "m", "cm"), 1e4, "m2 to cm2"); eq(SH.convert(1, 3, "ft", "in"), 1728, "ft3 to in3", 1e-6); eq(SH.convert(1, 1, "mi", "km"), 1.609344, "mile");
eq(SH.capacity(0.001).litres, 1, "1000 cm3 = 1 L"); eq(SH.capacity(0.003785411784).gallonsUS, 1, "US gallon", 1e-6); eq(SH.areaUnits(4046.8564224).acres, 1, "acre", 1e-9);
eq(SH.compute("cube", { a: "" }).ok, false, "empty"); eq(SH.compute("cube", { a: "-3" }).ok, false, "negative"); eq(SH.compute("zzz", {}).ok, false, "unknown");
eq(SH.scaleFor("sphere", { r: 1 }, "vol", 4 / 3 * Math.PI * 8), 2, "scale to 8x volume", 1e-9); eq(SH.scaleFor("cube", { a: 1 }, "area", 24), 2, "scale area");
SH.SHAPES.forEach(s => { const v = {}; s.inputs.forEach(i => v[i[0]] = s.id === "regular-polygon" && i[0] === "n" ? 5 : s.id === "sector" && i[0] === "t" ? 120 : s.id === "annulus" && i[0] === "r" ? 1 : s.id === "torus" && i[0] === "r" ? 1 : s.id === "parallelogram" && i[0] === "s" ? "" : s.id === "annulus" ? 3 : 3); const r = SH.compute(s.id, v); eq(r.ok, true, s.id + " computes with sample values " + (r.error || "")); if (r.ok) r.results.forEach(x => eq(isFinite(x.value) && x.value > 0, true, s.id + " " + x.label + " positive")); });
// 3D meshes: the volume and area of the triangle mesh must equal the formulas (outward normals, closed surface)
const MESH_EX = { cube: { a: 3 }, box: { a: 6, b: 4, c: 3 }, prism: { a: 3, b: 4, c: 5, l: 10 }, cylinder: { r: 3, h: 10 }, cone: { r: 3, h: 4 }, frustum: { R: 5, r: 2, h: 6 }, sphere: { r: 5 }, hemisphere: { r: 5 }, capsule: { r: 2, h: 6 }, ellipsoid: { a: 5, b: 3, c: 2 }, torus: { R: 6, r: 2 }, pyramid: { a: 6, h: 4 }, "rect-pyramid": { a: 6, b: 4, h: 5 }, tetrahedron: { a: 4 }, octahedron: { a: 4 } };
Object.keys(MESH_EX).forEach(id => { const M = SH.mesh(id, MESH_EX[id], 96), r = SH.compute(id, MESH_EX[id]), V = r.results.filter(q => q.kind === "vol")[0].value; eq(M && M.verts.length > 3, true, id + " has a mesh"); if (!M) return; const mv = SH.meshVolume(M); eq(Math.abs(mv - V) / V < 0.004, true, id + " mesh volume " + mv.toFixed(3) + " vs " + V.toFixed(3));
	const S = r.results.filter(q => q.label === "Surface area" || q.label.indexOf("Surface area (") === 0 || q.label === "Total surface (with base)")[0]; if (S) eq(Math.abs(SH.meshArea(M) - S.value) / S.value < 0.012, true, id + " mesh area " + SH.meshArea(M).toFixed(3) + " vs " + S.value.toFixed(3)); });
// flat meshes: triangle area equals the area formula
const FLAT_EX = { square: { a: 5 }, rectangle: { a: 8, b: 5 }, triangle: { a: 7, b: 8, c: 9 }, "triangle-bh": { b: 10, h: 6 }, circle: { r: 4 }, ellipse: { a: 6, b: 4 }, trapezoid: { a: 6, b: 10, h: 4 }, parallelogram: { b: 9, h: 5 }, rhombus: { p: 8, q: 6 }, "regular-polygon": { n: 6, a: 4 }, sector: { r: 6, t: 60 }, annulus: { R: 5, r: 3 } };
Object.keys(FLAT_EX).forEach(id => { const M = SH.mesh(id, FLAT_EX[id], 128), A = SH.compute(id, FLAT_EX[id]).results.filter(q => q.label === "Area")[0].value; eq(M && M.lines.length >= 1, true, id + " flat mesh with a dimension line"); if (M) eq(Math.abs(SH.meshArea(M) - A) / A < 0.004, true, id + " flat mesh area " + SH.meshArea(M).toFixed(3) + " vs " + A.toFixed(3)); });
eq(SH.SHAPES.length >= 25, true, "25+ shapes");
console.log(f ? f + " of " + n + " checks FAILED" : "all " + n + " checks passed"); process.exit(f ? 1 : 0);
