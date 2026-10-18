// node tool_apps_src/geometry-tests.js
const GE = require("./geometry/lib.js");
let f = 0, n = 0; function eq(a, b, m, tol) { n++; const ok = typeof b === "number" ? Math.abs(a - b) <= (tol == null ? 1e-9 : tol) : JSON.stringify(a) === JSON.stringify(b); if (!ok) { f++; console.log("FAIL", m, JSON.stringify(a), "!=", JSON.stringify(b)); } }
eq(GE.angleDeg([1, 0], [0, 0], [0, 1]), 90, "right angle"); eq(GE.angleDeg([1, 0], [0, 0], [-1, 0]), 180, "straight"); eq(GE.angleDeg([1, 0], [0, 0], [1, 1]), 45, "45", 1e-9); eq(GE.angleDeg([1, 0], [0, 0], [0, 0]), 0, "degenerate");
["zero:0", "acute:30", "right:90", "obtuse:120", "straight:180", "reflex:270", "full:360"].forEach(s => { const [k, v] = s.split(":"); eq(GE.classifyAngle(+v), k, "classify " + v); }); eq(GE.classifyAngle(450), "right", "450 = 90"); eq(GE.classifyAngle(-90), "reflex", "-90 = 270");
eq(GE.complement(30), 60, "complement"); eq(GE.complement(120), null, "no complement"); eq(GE.supplement(120), 60, "supplement"); eq(GE.conjugate(100), 260, "conjugate"); eq(GE.toRad(180), Math.PI, "rad"); eq(GE.toGrad(90), 100, "grad");
let t = GE.triangle([0, 0], [4, 0], [0, 3]); eq(t.a, 5, "hyp a=|BC|"); eq(t.area, 6, "area"); eq(t.byAngle, "right", "right"); eq(t.bySide, "scalene", "345 scalene"); eq(t.A, 90, "A = 90"); eq(t.A + t.B + t.C, 180, "sum 180", 1e-9); eq(t.B, 36.86989764584402, "B 3-4-5", 1e-9);
t = GE.triangle([0, 0], [2, 0], [1, Math.sqrt(3)]); eq(t.bySide, "equilateral", "equilateral"); eq(t.A, 60, "60", 1e-9); eq(t.byAngle, "acute", "acute");
t = GE.triangle([0, 0], [5, 0], [-1.5, 2]); eq(t.byAngle, "obtuse", "obtuse"); eq(GE.triangle([0, 0], [1, 1], [2, 2]), null, "collinear"); eq(GE.triangle([0, 0], [0, 0], [1, 1]), null, "same point");
t = GE.triangle([0, 0], [4, 0], [2, 3]); eq(t.bySide, "isosceles", "isosceles"); eq(t.A, t.B, "base angles equal", 1e-9);
let cc = GE.circumcircle([0, 0], [4, 0], [0, 3]); eq(cc.r, 2.5, "circumradius right = hyp/2"); eq(cc.c[0], 2, "circumcentre x"); eq(cc.c[1], 1.5, "circumcentre y"); eq(GE.circumcircle([0, 0], [1, 1], [2, 2]), null, "collinear circle");
let ic = GE.incircle([0, 0], [4, 0], [0, 3]); eq(ic.r, 1, "inradius 3-4-5"); eq(ic.c[0], 1, "incentre x"); eq(ic.c[1], 1, "incentre y");
let G = GE.centroid([0, 0], [6, 0], [0, 3]); eq(G[0], 2, "centroid x"); eq(G[1], 1, "centroid y"); let H = GE.orthocenter([0, 0], [4, 0], [0, 3]); eq(H[0], 0, "right triangle orthocentre at the right angle vertex", 1e-9); eq(H[1], 0, "H y", 1e-9);
// Euler line: O, G, H collinear with H - O = 3 (G - O)
{ const A = [1, 2], B = [7, 3], C = [3, 8], O = GE.circumcircle(A, B, C).c, Gc = GE.centroid(A, B, C), Ho = GE.orthocenter(A, B, C); eq(Ho[0] - O[0], 3 * (Gc[0] - O[0]), "Euler line x", 1e-9); eq(Ho[1] - O[1], 3 * (Gc[1] - O[1]), "Euler line y", 1e-9); }
// similar triangles
{ const t1 = GE.triangle([0, 0], [4, 0], [0, 3]), s = GE.scaleAbout([[0, 0], [4, 0], [0, 3]], [1, 1], 2.5), t2 = GE.triangle(s[0], s[1], s[2]); eq(GE.similar(t1, t2), 2.5, "similar ratio"); eq(t2.area / t1.area, 6.25, "area ratio k^2", 1e-9); eq(GE.similar(t1, GE.triangle([0, 0], [4, 0], [2, 3])), null, "not similar"); }
// transversal
let tr = GE.transversal(70); eq(tr, [110, 70, 70, 110, 110, 70, 70, 110], "parallel transversal"); eq(GE.transversal(70, 80)[4], 100, "non-parallel lower line");
eq(GE.relation(1, 5), "corr", "corresponding"); eq(GE.relation(3, 6), "alt", "alt interior"); eq(GE.relation(4, 5), "alt", "alt interior 2"); eq(GE.relation(1, 8), "altx", "alt exterior"); eq(GE.relation(3, 5), "co", "co-interior"); eq(GE.relation(1, 4), "vert", "vertical"); eq(GE.relation(1, 2), "lin", "linear pair"); eq(GE.relation(2, 3), "vert", "2 and 3 vertical"); eq(GE.relation(1, 6), "", "no relation"); eq(GE.relation(2, 2), "", "same");
// every pair's rule holds for parallel lines
for (let i = 1; i <= 8; i++) for (let j = 1; j <= 8; j++) { const r = GE.relation(i, j); if (r) eq(GE.checkRelation(r, tr[i - 1], tr[j - 1]), true, "rule " + r + " " + i + "," + j); }
eq(GE.checkRelation("corr", 70, 80), false, "corresponding fails when not parallel"); eq(GE.relationRule("lin"), "sum", "lin sum"); eq(GE.relationRule("alt"), "equal", "alt equal");
// circles
{ const O = [0, 0], r = 10, A = GE.onCircle(O, r, 20), B = GE.onCircle(O, r, 140), P = GE.onCircle(O, r, 250), q = GE.inscribed(A, P, B); eq(q.arc, 120, "arc AB", 1e-9); eq(q.inscribed, 60, "inscribed = half the arc", 1e-9); eq(GE.centralAngle(A, O, B), 120, "central", 1e-9); eq(GE.angleDeg(GE.onCircle(O, 5, 10), O, GE.onCircle(O, 5, 100)), 90, "onCircle angle", 1e-9);
	const D1 = GE.onCircle(O, r, 20), D2 = GE.onCircle(O, r, 200); eq(GE.inscribed(D1, P, D2).inscribed, 90, "Thales: diameter subtends 90", 1e-9);
	const quad = [GE.onCircle(O, r, 10), GE.onCircle(O, r, 100), GE.onCircle(O, r, 200), GE.onCircle(O, r, 300)], qa = GE.cyclicQuad(quad); eq(qa[0] + qa[2], 180, "cyclic opposite angles", 1e-9); eq(qa[1] + qa[3], 180, "other pair", 1e-9); eq(qa[0] + qa[1] + qa[2] + qa[3], 360, "quad sum", 1e-9);
	const tcA = GE.onCircle(O, r, 0), tcB = GE.onCircle(O, r, 80), tc = GE.tangentChord(O, tcA, tcB), P2 = GE.onCircle(O, r, 200); eq(Math.min(tc.one, tc.other), 40, "tangent-chord = half arc", 1e-9); eq(tc.arcAB, 80, "arc", 1e-9); eq(GE.inscribed(tcA, P2, tcB).inscribed, 40, "alternate segment theorem", 1e-9); }
// polygons
{ const p = GE.regularPolygon(5); eq(p.sum, 540, "pentagon sum"); eq(p.interior, 108, "pentagon interior"); eq(p.exterior, 72, "exterior"); eq(p.diagonals, 5, "diagonals"); eq(GE.regularPolygon(6).diagonals, 9, "hexagon diagonals"); eq(GE.regularPolygon(3).triangles, 1, "triangle");
	const sq = GE.polygonAngles([[0, 0], [1, 0], [1, 1], [0, 1]]); eq(sq, [90, 90, 90, 90], "square angles", 1e-9); const sqcw = GE.polygonAngles([[0, 0], [0, 1], [1, 1], [1, 0]]); eq(sqcw.reduce((a, b) => a + b, 0), 360, "clockwise square", 1e-9);
	const dart = GE.polygonAngles([[0, 0], [4, 0], [2, 1], [0, 4]].reverse()); eq(Math.round(dart.reduce((a, b) => a + b, 0) * 1e6) / 1e6, 360, "concave quad sum 360"); eq(dart.some(a => a > 180), true, "has a reflex angle");
	const pent = Array.from({ length: 5 }, (_, i) => [Math.cos(i * 2 * Math.PI / 5), Math.sin(i * 2 * Math.PI / 5)]); GE.polygonAngles(pent).forEach(a => eq(a, 108, "regular pentagon vertex", 1e-9)); }
console.log(f ? f + " of " + n + " checks FAILED" : "all " + n + " checks passed"); process.exit(f ? 1 : 0);
