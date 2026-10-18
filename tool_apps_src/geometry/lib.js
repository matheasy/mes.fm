/* MES Geometry & Angle Lab -- pure maths (no DOM). Browser global `GE`; node: require('./tool_apps_src/geometry/lib.js'); tests: node tool_apps_src/geometry-tests.js
 * Points are [x, y] (y may point down on screen: only lengths and unsigned angles are used unless noted). Angles in degrees. */
(function (root) {
	"use strict";
	var D = 180 / Math.PI;
	function dist(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }
	function fix(n, d) { if (n == null || !isFinite(n)) return ""; return (Math.round(n * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d); }
	function trim(n, d) { return fix(n, d).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""); }
	// the angle at Q between rays QP and QR, 0..180
	function angleDeg(P, Q, R) {
		var ux = P[0] - Q[0], uy = P[1] - Q[1], vx = R[0] - Q[0], vy = R[1] - Q[1], n = Math.hypot(ux, uy) * Math.hypot(vx, vy); if (!n) return 0;
		return Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / n))) * D;
	}
	function classifyAngle(d) {
		d = ((d % 360) + 360) % 360 || (d > 0 ? 360 : 0); var e = 0.05;
		if (d <= e) return "zero"; if (Math.abs(d - 90) <= e) return "right"; if (d < 90) return "acute"; if (Math.abs(d - 180) <= e) return "straight"; if (d < 180) return "obtuse"; if (Math.abs(d - 360) <= e) return "full"; return "reflex";
	}
	var ANGLE_INFO = { zero: "zero angle (0°)", acute: "acute (between 0° and 90°)", right: "right angle (exactly 90°)", obtuse: "obtuse (between 90° and 180°)", straight: "straight angle (exactly 180°)", reflex: "reflex (between 180° and 360°)", full: "full turn (360°)" };
	function complement(d) { return d <= 90 ? 90 - d : null; }
	function supplement(d) { return d <= 180 ? 180 - d : null; }
	function conjugate(d) { return 360 - d; }
	function toRad(d) { return d / D; } function toDeg(r) { return r * D; } function toGrad(d) { return d * 10 / 9; }

	/* ---- triangles ---- */
	function triangle(A, B, C) {
		var a = dist(B, C), b = dist(C, A), c = dist(A, B), cr = (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]), area = Math.abs(cr) / 2;
		if (a < 1e-9 || b < 1e-9 || c < 1e-9 || area < 1e-9) return null;
		var A_ = angleDeg(B, A, C), B_ = angleDeg(A, B, C), C_ = 180 - A_ - B_, mx = Math.max(A_, B_, C_), tol = 0.6;
		var byAngle = Math.abs(mx - 90) <= tol ? "right" : mx > 90 ? "obtuse" : "acute", se = function (x, y) { return Math.abs(x - y) <= 0.01 * Math.max(x, y); };
		var eqs = (se(a, b) ? 1 : 0) + (se(b, c) ? 1 : 0) + (se(a, c) ? 1 : 0), bySide = eqs >= 3 ? "equilateral" : eqs >= 1 ? "isosceles" : "scalene";
		return { a: a, b: b, c: c, A: A_, B: B_, C: C_, area: area, perimeter: a + b + c, byAngle: byAngle, bySide: bySide, cw: cr > 0 };
	}
	function circumcircle(A, B, C) {
		var d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1])); if (Math.abs(d) < 1e-12) return null;
		var a2 = A[0] * A[0] + A[1] * A[1], b2 = B[0] * B[0] + B[1] * B[1], c2 = C[0] * C[0] + C[1] * C[1];
		var x = (a2 * (B[1] - C[1]) + b2 * (C[1] - A[1]) + c2 * (A[1] - B[1])) / d, y = (a2 * (C[0] - B[0]) + b2 * (A[0] - C[0]) + c2 * (B[0] - A[0])) / d;
		return { c: [x, y], r: dist([x, y], A) };
	}
	function incircle(A, B, C) {
		var a = dist(B, C), b = dist(C, A), c = dist(A, B), p = a + b + c; if (!p) return null; var s = p / 2, ar = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])) / 2;
		return { c: [(a * A[0] + b * B[0] + c * C[0]) / p, (a * A[1] + b * B[1] + c * C[1]) / p], r: ar / s };
	}
	function centroid(A, B, C) { return [(A[0] + B[0] + C[0]) / 3, (A[1] + B[1] + C[1]) / 3]; }
	function orthocenter(A, B, C) { var O = circumcircle(A, B, C); if (!O) return null; return [A[0] + B[0] + C[0] - 2 * O.c[0], A[1] + B[1] + C[1] - 2 * O.c[1]]; }
	function scaleAbout(pts, c, k) { return pts.map(function (p) { return [c[0] + (p[0] - c[0]) * k, c[1] + (p[1] - c[1]) * k]; }); }
	// are two triangles similar? (AA with a tolerance in degrees) -> ratio of corresponding sides after matching sorted angles
	function similar(t1, t2, tol) {
		tol = tol == null ? 0.6 : tol; var a1 = [t1.A, t1.B, t1.C].sort(function (x, y) { return x - y; }), a2 = [t2.A, t2.B, t2.C].sort(function (x, y) { return x - y; });
		if (Math.abs(a1[0] - a2[0]) > tol || Math.abs(a1[1] - a2[1]) > tol || Math.abs(a1[2] - a2[2]) > tol) return null;
		var s1 = [t1.a, t1.b, t1.c].sort(function (x, y) { return x - y; }), s2 = [t2.a, t2.b, t2.c].sort(function (x, y) { return x - y; }); return s2[2] / s1[2];
	}
	var PRESETS = { "right-345": [[0, 0], [4, 0], [0, 3]], "right-isos": [[0, 0], [4, 0], [0, 4]], "30-60-90": [[0, 0], [Math.sqrt(3), 0], [0, 1]], equilateral: [[0, 0], [2, 0], [1, Math.sqrt(3)]], isosceles: [[0, 0], [4, 0], [2, 3]], scalene: [[0, 0], [5, 0], [1.5, 3]], obtuse: [[0, 0], [5, 0], [-1.5, 2]] };

	/* ---- two lines and a transversal ----
	 * numbering: at the upper line 1 = upper left, 2 = upper right, 3 = lower left, 4 = lower right; the lower line 5, 6, 7, 8 the same way.
	 * theta1 / theta2 = angle between each line (pointing right) and the transversal (pointing up-right), 0..180. Parallel lines: theta2 = theta1. */
	function transversal(theta1, theta2) {
		function four(t) { return [180 - t, t, t, 180 - t]; }
		return four(theta1).concat(four(theta2 == null ? theta1 : theta2));
	}
	var REL = { corr: "corresponding", alt: "alternate interior", altx: "alternate exterior", co: "co-interior (same side)", vert: "vertical (opposite)", lin: "linear pair" };
	function relation(i, j) {
		if (i === j) return "";
		function has(l) { return l.some(function (p) { return (p[0] === i && p[1] === j) || (p[0] === j && p[1] === i); }); }
		if (has([[1, 4], [2, 3], [5, 8], [6, 7]])) return "vert";
		if (has([[1, 2], [3, 4], [1, 3], [2, 4], [5, 6], [7, 8], [5, 7], [6, 8]])) return "lin";
		if (has([[1, 5], [2, 6], [3, 7], [4, 8]])) return "corr";
		if (has([[3, 6], [4, 5]])) return "alt";
		if (has([[1, 8], [2, 7]])) return "altx";
		if (has([[3, 5], [4, 6]])) return "co";
		return "";
	}
	// what the rule says for two angles given parallel lines: "equal" or "sum to 180"
	function relationRule(rel) { return rel === "lin" || rel === "co" ? "sum" : rel ? "equal" : ""; }
	function checkRelation(rel, a, b, tol) { tol = tol == null ? 0.5 : tol; var r = relationRule(rel); return r === "equal" ? Math.abs(a - b) <= tol : r === "sum" ? Math.abs(a + b - 180) <= tol : null; }

	/* ---- circles ---- */
	function onCircle(O, r, deg) { return [O[0] + r * Math.cos(deg / D), O[1] - r * Math.sin(deg / D)]; }   // screen y points down, so +deg is counter-clockwise on screen
	// inscribed angle APB and the arc AB (not containing P) it stands on; the central angle on that arc equals the arc
	function inscribed(A, P, B) { var ang = angleDeg(A, P, B); return { inscribed: ang, arc: 2 * ang }; }
	function centralAngle(A, O, B) { return angleDeg(A, O, B); }
	function cyclicQuad(P) { var n = 4, out = []; for (var i = 0; i < n; i++) out.push(angleDeg(P[(i + n - 1) % n], P[i], P[(i + 1) % n])); return out; }
	// angle between the tangent at A and the chord AB (both sides)
	function tangentChord(O, A, B) {
		var tx = -(A[1] - O[1]), ty = A[0] - O[0], T = [A[0] + tx, A[1] + ty], a1 = angleDeg(B, A, T); return { one: a1, other: 180 - a1, arcAB: angleDeg(A, O, B) };
	}

	/* ---- polygons ---- */
	function regularPolygon(n) { return { n: n, sum: (n - 2) * 180, interior: (n - 2) * 180 / n, exterior: 360 / n, diagonals: n * (n - 3) / 2, triangles: n - 2, centralAngle: 360 / n }; }
	function polygonAngles(P) {
		var n = P.length, ar = 0, i; for (i = 0; i < n; i++) { var q = P[(i + 1) % n]; ar += P[i][0] * q[1] - q[0] * P[i][1]; } var sgn = ar >= 0 ? 1 : -1, out = [];
		for (i = 0; i < n; i++) {
			var p0 = P[(i + n - 1) % n], p1 = P[i], p2 = P[(i + 1) % n], v1 = [p1[0] - p0[0], p1[1] - p0[1]], v2 = [p2[0] - p1[0], p2[1] - p1[1]];
			var turn = Math.atan2(v1[0] * v2[1] - v1[1] * v2[0], v1[0] * v2[0] + v1[1] * v2[1]) * D; out.push(180 - sgn * turn);
		}
		return out;
	}
	var GE = { dist: dist, fix: fix, trim: trim, angleDeg: angleDeg, classifyAngle: classifyAngle, ANGLE_INFO: ANGLE_INFO, complement: complement, supplement: supplement, conjugate: conjugate, toRad: toRad, toDeg: toDeg, toGrad: toGrad, triangle: triangle, circumcircle: circumcircle, incircle: incircle, centroid: centroid, orthocenter: orthocenter, scaleAbout: scaleAbout, similar: similar, PRESETS: PRESETS,
		transversal: transversal, relation: relation, REL: REL, relationRule: relationRule, checkRelation: checkRelation, onCircle: onCircle, inscribed: inscribed, centralAngle: centralAngle, cyclicQuad: cyclicQuad, tangentChord: tangentChord, regularPolygon: regularPolygon, polygonAngles: polygonAngles };
	if (typeof module !== "undefined" && module.exports) module.exports = GE; else root.GE = GE;
})(typeof window !== "undefined" ? window : this);
