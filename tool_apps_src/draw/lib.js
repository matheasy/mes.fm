/* MES Draw (mes.fm/draw): the pure part. Geometry (SVG path data for every shape and brush), 2D matrices, bounding boxes, hit maths,
 * paper patterns, the SVG writer, templates / examples, and the emoji + symbol lists. No DOM: runs in node for the tests
 * (node tool_apps_src/draw-tests.js). The page (app.js) turns the path data into Path2D objects, so the canvas and the SVG export draw
 * exactly the same shapes.
 *
 * A drawing = {w, h, bg: {c: colour | null (transparent), p: paper pattern id}, objs: [...]}. Every object has an affine matrix m = [a,b,c,d,e,f]
 * (canvas order: x' = a x + c y + e, y' = b x + d y + f) applied to its own coordinates, so moving / scaling / rotating never touches the points.
 *   path : {t:"path", brush: pen|calli|marker|hl|pencil|neon|spray|erase, pts:[x,y,p, ...], c, w, o, sd (spray seed)}
 *   shape: {t:"shape", k: kind, x, y, w, h (line kinds: from (x,y) to (x+w, y+h)), c (stroke or null), sw, f (fill or null), dash, o}
 *   text : {t:"text", s, x, y, size, font, c, b (bold), i (italic), al (l|c|r), sc (outline colour), bgc (box colour), tw, th (measured size)}
 *   img  : {t:"img", src (data URL), x, y, w, h, o}
 */
(function (root) {
	"use strict";
	var I = [1, 0, 0, 1, 0, 0];
	function r2(v) { return Math.round(v * 100) / 100; }
	function fin(v) { return typeof v === "number" && isFinite(v); }

	/* ---------- matrices ---------- */
	function mul(A, B) { return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]]; }
	function inv(m) { var det = m[0] * m[3] - m[1] * m[2]; if (!det) return I.slice(); var a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det; return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])]; }
	function ap(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
	function tr(tx, ty) { return [1, 0, 0, 1, tx, ty]; }
	function scaleAt(sx, sy, cx, cy) { return [sx, 0, 0, sy, cx - sx * cx, cy - sy * cy]; }
	function rotateAt(a, cx, cy) { var c = Math.cos(a), s = Math.sin(a); return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy]; }
	function mirrorX(cx) { return [-1, 0, 0, 1, 2 * cx, 0]; }
	function mirrorY(cy) { return [1, 0, 0, -1, 0, 2 * cy]; }
	function isId(m) { return !m || (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1 && m[4] === 0 && m[5] === 0); }
	function mScale(m) { return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1; }

	/* ---------- seeded random (spray dots, examples) ---------- */
	function rng(seed) { var s = seed >>> 0; return function () { s = (s + 0x6D2B79F5) >>> 0; var t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

	/* ---------- shapes: SVG path data ---------- */
	var SHAPES = [
		["rect", "Rectangle"], ["round", "Rounded box"], ["ellipse", "Circle / ellipse"], ["line", "Line"], ["arrow", "Arrow"], ["arrow2", "Double arrow"],
		["tri", "Triangle"], ["rtri", "Right triangle"], ["diamond", "Diamond"], ["penta", "Pentagon"], ["hexa", "Hexagon"], ["octa", "Octagon"],
		["star", "Star"], ["star6", "Six-point star"], ["burst", "Burst"], ["heart", "Heart"], ["bubble", "Speech bubble"], ["think", "Thought bubble"],
		["cloud", "Cloud"], ["moon", "Moon"], ["bolt", "Lightning"], ["plus", "Plus"], ["check", "Check mark"], ["xmark", "X mark"],
		["blockarrow", "Block arrow"], ["para", "Parallelogram"], ["trap", "Trapezoid"], ["cube", "Cube"], ["cyl", "Cylinder"], ["arc", "Smile curve"]
	];
	var LINE_KINDS = { line: 1, arrow: 1, arrow2: 1 };
	var OPEN_KINDS = { line: 1, arrow: 1, arrow2: 1, check: 1, xmark: 1, arc: 1 };
	function P(x, y) { return r2(x) + " " + r2(y); }
	function poly(pts) { var d = ""; for (var i = 0; i < pts.length; i++) d += (i ? " L " : "M ") + P(pts[i][0], pts[i][1]); return d + " Z"; }
	function regular(n, x, y, w, h, rot) { var a0 = rot === undefined ? -Math.PI / 2 : rot, pts = []; for (var i = 0; i < n; i++) { var a = a0 + i * 2 * Math.PI / n; pts.push([x + w / 2 + w / 2 * Math.cos(a), y + h / 2 + h / 2 * Math.sin(a)]); } return pts; }
	function starPts(n, x, y, w, h, inner) { var pts = []; for (var i = 0; i < n * 2; i++) { var a = -Math.PI / 2 + i * Math.PI / n, r = i % 2 ? inner : 1; pts.push([x + w / 2 + w / 2 * r * Math.cos(a), y + h / 2 + h / 2 * r * Math.sin(a)]); } return pts; }
	function ellD(cx, cy, rx, ry) { return "M " + P(cx - rx, cy) + " A " + r2(rx) + " " + r2(ry) + " 0 1 0 " + P(cx + rx, cy) + " A " + r2(rx) + " " + r2(ry) + " 0 1 0 " + P(cx - rx, cy) + " Z"; }
	function roundRectD(x, y, w, h, r) {
		r = Math.max(0, Math.min(r, w / 2, h / 2));
		return "M " + P(x + r, y) + " H " + r2(x + w - r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x + w, y + r) + " V " + r2(y + h - r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x + w - r, y + h) +
			" H " + r2(x + r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x, y + h - r) + " V " + r2(y + r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x + r, y) + " Z";
	}
	function headD(x1, y1, x2, y2, len) { var a = Math.atan2(y2 - y1, x2 - x1), s = 0.45; return " M " + P(x2 - len * Math.cos(a - s), y2 - len * Math.sin(a - s)) + " L " + P(x2, y2) + " L " + P(x2 - len * Math.cos(a + s), y2 - len * Math.sin(a + s)); }
	function arrowHead(sw) { return Math.max(12, (sw || 4) * 3.6); }
	/* unit-box mapper for the curvy ones (drawn in 0..1) */
	function U(x, y, w, h) { return function (u, v) { return P(x + u * w, y + v * h); }; }
	function norm(o) { var x = o.x, y = o.y, w = o.w, h = o.h; if (w < 0) { x += w; w = -w; } if (h < 0) { y += h; h = -h; } return { x: x, y: y, w: w, h: h }; }
	function shapeD(k, x, y, w, h, sw) {
		if (LINE_KINDS[k]) {
			var x2 = x + w, y2 = y + h, d = "M " + P(x, y) + " L " + P(x2, y2), hl = arrowHead(sw);
			if (k === "arrow" || k === "arrow2") d += headD(x, y, x2, y2, hl);
			if (k === "arrow2") d += headD(x2, y2, x, y, hl);
			return d;
		}
		var b = norm({ x: x, y: y, w: w, h: h }); x = b.x; y = b.y; w = b.w; h = b.h;
		var u = U(x, y, w, h), cx = x + w / 2, cy = y + h / 2;
		switch (k) {
			case "rect": return "M " + P(x, y) + " H " + r2(x + w) + " V " + r2(y + h) + " H " + r2(x) + " Z";
			case "round": return roundRectD(x, y, w, h, Math.min(w, h) * 0.18);
			case "ellipse": return ellD(cx, cy, w / 2, h / 2);
			case "tri": return poly([[cx, y], [x + w, y + h], [x, y + h]]);
			case "rtri": return poly([[x, y], [x + w, y + h], [x, y + h]]);
			case "diamond": return poly([[cx, y], [x + w, cy], [cx, y + h], [x, cy]]);
			case "penta": return poly(regular(5, x, y, w, h));
			case "hexa": return poly(regular(6, x, y, w, h, 0));
			case "octa": return poly(regular(8, x, y, w, h, Math.PI / 8));
			case "star": return poly(starPts(5, x, y, w, h, 0.42));
			case "star6": return poly(starPts(6, x, y, w, h, 0.58));
			case "burst": return poly(starPts(12, x, y, w, h, 0.72));
			case "heart": return "M " + u(.5, .28) + " C " + u(.5, .18) + " " + u(.42, 0) + " " + u(.25, 0) + " C " + u(.08, 0) + " " + u(0, .14) + " " + u(0, .32) + " C " + u(0, .58) + " " + u(.26, .77) + " " + u(.5, 1) +
				" C " + u(.74, .77) + " " + u(1, .58) + " " + u(1, .32) + " C " + u(1, .14) + " " + u(.92, 0) + " " + u(.75, 0) + " C " + u(.58, 0) + " " + u(.5, .18) + " " + u(.5, .28) + " Z";
			case "bubble": {
				var bh = h * 0.78, r = Math.min(w, bh) * 0.2;
				return "M " + P(x + r, y) + " H " + r2(x + w - r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x + w, y + r) + " V " + r2(y + bh - r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x + w - r, y + bh) +
					" H " + r2(x + w * 0.42) + " L " + P(x + w * 0.2, y + h) + " L " + P(x + w * 0.27, y + bh) + " H " + r2(x + r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x, y + bh - r) + " V " + r2(y + r) + " A " + r2(r) + " " + r2(r) + " 0 0 1 " + P(x + r, y) + " Z";
			}
			case "think": return cloudD(x, y, w, h * 0.74, 10) + " " + ellD(x + w * 0.24, y + h * 0.84, w * 0.06, h * 0.05) + " " + ellD(x + w * 0.12, y + h * 0.95, w * 0.035, h * 0.03);
			case "cloud": return cloudD(x, y, w, h, 9);
			case "moon": return "M " + u(.62, 0) + " A " + r2(w * .5) + " " + r2(h * .5) + " 0 1 0 " + u(.62, 1) + " A " + r2(w * .4) + " " + r2(h * .42) + " 0 1 1 " + u(.62, 0) + " Z";
			case "bolt": return poly([[x + w * .58, y], [x + w * .12, y + h * .56], [x + w * .45, y + h * .56], [x + w * .34, y + h], [x + w * .88, y + h * .4], [x + w * .54, y + h * .4], [x + w * .7, y]]);
			case "plus": { var t = 0.32; return poly([[x + w * t, y], [x + w * (1 - t), y], [x + w * (1 - t), y + h * t], [x + w, y + h * t], [x + w, y + h * (1 - t)], [x + w * (1 - t), y + h * (1 - t)], [x + w * (1 - t), y + h], [x + w * t, y + h], [x + w * t, y + h * (1 - t)], [x, y + h * (1 - t)], [x, y + h * t], [x + w * t, y + h * t]]); }
			case "check": return "M " + u(0, .55) + " L " + u(.36, .92) + " L " + u(1, .08);
			case "xmark": return "M " + u(0, 0) + " L " + u(1, 1) + " M " + u(1, 0) + " L " + u(0, 1);
			case "blockarrow": return poly([[x, y + h * .3], [x + w * .6, y + h * .3], [x + w * .6, y], [x + w, cy], [x + w * .6, y + h], [x + w * .6, y + h * .7], [x, y + h * .7]]);
			case "para": return poly([[x + w * .25, y], [x + w, y], [x + w * .75, y + h], [x, y + h]]);
			case "trap": return poly([[x + w * .22, y], [x + w * .78, y], [x + w, y + h], [x, y + h]]);
			case "cube": { var dx = w * .28, dy = h * .28; return poly([[x, y + dy], [x + dx, y], [x + w, y], [x + w, y + h - dy], [x + w - dx, y + h], [x, y + h]]) + " M " + P(x, y + dy) + " H " + r2(x + w - dx) + " V " + r2(y + h) + " M " + P(x + w - dx, y + dy) + " L " + P(x + w, y); }
			case "cyl": { var ry = Math.min(h * .14, w * .3); return "M " + P(x, y + ry) + " V " + r2(y + h - ry) + " A " + r2(w / 2) + " " + r2(ry) + " 0 0 0 " + P(x + w, y + h - ry) + " V " + r2(y + ry) + " " + ellD(cx, y + ry, w / 2, ry).replace(/^M/, "M"); }
			case "arc": return "M " + u(0, .1) + " Q " + u(.5, 1.7) + " " + u(1, .1);
		}
		return "M " + P(x, y) + " H " + r2(x + w) + " V " + r2(y + h) + " H " + r2(x) + " Z";
	}
	function cloudD(x, y, w, h, n) {
		var cx = x + w / 2, cy = y + h / 2, rx = w * 0.38, ry = h * 0.32, pts = [];
		for (var i = 0; i < n; i++) { var a = -Math.PI / 2 + i * 2 * Math.PI / n; pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
		var d = "M " + P(pts[0][0], pts[0][1]);
		for (var j = 0; j < n; j++) { var p = pts[j], q = pts[(j + 1) % n], ma = -Math.PI / 2 + (j + 0.5) * 2 * Math.PI / n; d += " Q " + P(cx + rx * 1.62 * Math.cos(ma), cy + ry * 1.62 * Math.sin(ma)) + " " + P(q[0], q[1]); }
		return d + " Z";
	}

	/* ---------- brushes ---------- */
	var BRUSHES = [
		["pen", "Pen", "Smooth ink that gets thinner when you move fast (or press lightly with a stylus)"],
		["marker", "Marker", "Even, round marker line"],
		["pencil", "Pencil", "Thin, slightly see-through pencil line"],
		["hl", "Highlighter", "See-through, flat-ended highlighter that darkens what is under it"],
		["calli", "Calligraphy", "A slanted nib: thick and thin by direction"],
		["neon", "Neon", "Glowing line"],
		["spray", "Spray", "Spray-paint dots"]
	];
	/* smooth a stroke (two passes of neighbour averaging), keeping the end points */
	function smoothPts(pts, passes) {
		var a = pts.slice(), n = a.length / 3; if (n < 3) return a;
		for (var p = 0; p < (passes || 1); p++) {
			var b = a.slice();
			for (var i = 1; i < n - 1; i++) for (var k = 0; k < 3; k++) b[i * 3 + k] = (a[(i - 1) * 3 + k] + 2 * a[i * 3 + k] + a[(i + 1) * 3 + k]) / 4;
			a = b;
		}
		return a;
	}
	/* drop points closer than `min` to the previous kept one (always keeps the last) */
	function thinPts(pts, min) {
		var n = pts.length / 3; if (n < 3) return pts.slice(); var out = [pts[0], pts[1], pts[2]], lx = pts[0], ly = pts[1];
		for (var i = 1; i < n - 1; i++) { var x = pts[i * 3], y = pts[i * 3 + 1]; if (Math.hypot(x - lx, y - ly) >= min) { out.push(x, y, pts[i * 3 + 2]); lx = x; ly = y; } }
		out.push(pts[(n - 1) * 3], pts[(n - 1) * 3 + 1], pts[(n - 1) * 3 + 2]); return out;
	}
	/* a centre-line path (marker, pencil, highlighter, neon, eraser): quadratic curves through the midpoints */
	function lineD(pts) {
		var n = pts.length / 3; if (!n) return "";
		if (n === 1) return "M " + P(pts[0], pts[1]) + " L " + P(pts[0] + 0.01, pts[1]);
		if (n === 2) return "M " + P(pts[0], pts[1]) + " L " + P(pts[3], pts[4]);
		var d = "M " + P(pts[0], pts[1]);
		for (var i = 1; i < n - 1; i++) { var x = pts[i * 3], y = pts[i * 3 + 1], mx = (x + pts[i * 3 + 3]) / 2, my = (y + pts[i * 3 + 4]) / 2; d += " Q " + P(x, y) + " " + P(mx, my); }
		return d + " L " + P(pts[(n - 1) * 3], pts[(n - 1) * 3 + 1]);
	}
	/* radius at each point: pressure (stylus) or speed (mouse / finger) thinning, calligraphy by direction */
	function radii(pts, w, brush) {
		var n = pts.length / 3, r = new Array(n), havePress = false, i;
		for (i = 0; i < n; i++) { var p = pts[i * 3 + 2]; if (p > 0 && p !== 0.5) { havePress = true; break; } }
		for (i = 0; i < n; i++) {
			var x = pts[i * 3], y = pts[i * 3 + 1], px = i ? pts[i * 3 - 3] : x, py = i ? pts[i * 3 - 2] : y, nx = i < n - 1 ? pts[i * 3 + 3] : x, ny = i < n - 1 ? pts[i * 3 + 4] : y;
			var f;
			if (brush === "calli") { var ang = Math.atan2(ny - py, nx - px); f = 0.12 + 0.88 * Math.abs(Math.sin(ang - Math.PI / 4)); }
			else if (havePress) f = 0.2 + 0.8 * Math.max(0, Math.min(1, pts[i * 3 + 2]));
			else { var v = Math.hypot(nx - px, ny - py) / 2; f = 1 - 0.55 * Math.min(1, v / (w * 2.2 + 4)); }
			r[i] = Math.max(0.35, w / 2 * f);
		}
		if (brush !== "calli") for (var pass = 0; pass < 2; pass++) { var q = r.slice(); for (i = 1; i < n - 1; i++) q[i] = (r[i - 1] + 2 * r[i] + r[i + 1]) / 4; r = q; }
		return r;
	}
	/* filled outline of a variable-width stroke (pen, calligraphy) */
	function outlineD(pts, w, brush) {
		var n = pts.length / 3; if (!n) return "";
		var r = radii(pts, w, brush);
		if (n === 1 || (n === 2 && Math.hypot(pts[3] - pts[0], pts[4] - pts[1]) < 0.5)) return ellD(pts[0], pts[1], r[0], r[0]);
		var L = [], R = [], i;
		for (i = 0; i < n; i++) {
			var x = pts[i * 3], y = pts[i * 3 + 1], px = i ? pts[i * 3 - 3] : x, py = i ? pts[i * 3 - 2] : y, nx = i < n - 1 ? pts[i * 3 + 3] : x, ny = i < n - 1 ? pts[i * 3 + 4] : y;
			var tx = nx - px, ty = ny - py, tl = Math.hypot(tx, ty) || 1, ox, oy;
			ox = -ty / tl; oy = tx / tl;
			L.push([x + ox * r[i], y + oy * r[i]]); R.push([x - ox * r[i], y - oy * r[i]]);
		}
		var d = "M " + P(L[0][0], L[0][1]);
		for (i = 1; i < n; i++) d += " L " + P(L[i][0], L[i][1]);
		var re = r[n - 1], rs = r[0];
		d += " A " + r2(re) + " " + r2(re) + " 0 0 1 " + P(R[n - 1][0], R[n - 1][1]);
		for (i = n - 2; i >= 0; i--) d += " L " + P(R[i][0], R[i][1]);
		d += " A " + r2(rs) + " " + r2(rs) + " 0 0 1 " + P(L[0][0], L[0][1]) + " Z";
		return d;
	}
	/* spray: deterministic dots around every point (the seed is stored, so the dots are the same every time it is drawn) */
	function sprayD(pts, w, sd) {
		var n = pts.length / 3, rnd = rng(sd || 1), d = "", dot = Math.max(0.8, w / 18), per = Math.max(4, Math.round(w * 0.9));
		for (var i = 0; i < n; i++) {
			var x = pts[i * 3], y = pts[i * 3 + 1];
			for (var k = 0; k < per; k++) { var a = rnd() * Math.PI * 2, rr = Math.sqrt(rnd()) * w / 2, dx = x + Math.cos(a) * rr, dy = y + Math.sin(a) * rr; d += "M " + P(dx, dy) + " h " + r2(dot) + " v " + r2(dot) + " h " + r2(-dot) + " Z "; }
		}
		return d.trim();
	}
	function isFilledBrush(b) { return b === "pen" || b === "calli" || b === "spray"; }
	function pathD(o) {
		if (o.brush === "pen" || o.brush === "calli") return outlineD(o.pts, o.w, o.brush);
		if (o.brush === "spray") return sprayD(o.pts, o.w, o.sd);
		return lineD(o.pts);
	}
	function objD(o) { if (o.t === "path") return pathD(o); if (o.t === "shape") return shapeD(o.k, o.x, o.y, o.w, o.h, o.sw); return ""; }

	/* ---------- bounding boxes ---------- */
	function estText(o) { var lines = String(o.s || "").split("\n"), mx = 0; lines.forEach(function (l) { mx = Math.max(mx, Array.from(l).length); }); return { w: Math.max(o.size * 0.4, mx * o.size * 0.58), h: lines.length * o.size * 1.2 }; }
	function localBox(o) {
		var x0, y0, x1, y1, pad = 0;
		if (o.t === "path") {
			x0 = y0 = Infinity; x1 = y1 = -Infinity;
			for (var i = 0; i < o.pts.length; i += 3) { var x = o.pts[i], y = o.pts[i + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
			pad = o.w / 2 + (o.brush === "neon" ? o.w : 0) + 1;
		} else if (o.t === "shape") {
			var b = norm(o); x0 = b.x; y0 = b.y; x1 = b.x + b.w; y1 = b.y + b.h;
			pad = (o.c ? (o.sw || 0) / 2 : 0) + (o.k === "arrow" || o.k === "arrow2" ? arrowHead(o.sw) * 0.5 : 0) + (o.k === "arc" ? 0 : 0);
			if (o.k === "arc") y1 = b.y + b.h * 0.95;
		} else if (o.t === "text") {
			var e = o.tw ? { w: o.tw, h: o.th } : estText(o), ox = o.al === "c" ? -e.w / 2 : o.al === "r" ? -e.w : 0;
			x0 = o.x + ox; y0 = o.y; x1 = x0 + e.w; y1 = o.y + e.h; pad = o.sc ? Math.max(2, o.size * 0.06) : 0; if (o.bgc) pad += o.size * 0.25;
		} else { x0 = o.x; y0 = o.y; x1 = o.x + o.w; y1 = o.y + o.h; }
		if (!isFinite(x0)) { x0 = y0 = x1 = y1 = 0; }
		return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad };
	}
	function boxCorners(b) { return [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]]; }
	function worldBox(o) {
		var b = localBox(o), m = o.m || I, xs = [], ys = [];
		boxCorners(b).forEach(function (c) { var p = ap(m, c[0], c[1]); xs.push(p[0]); ys.push(p[1]); });
		var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
		return { x: x0, y: y0, w: Math.max.apply(null, xs) - x0, h: Math.max.apply(null, ys) - y0 };
	}
	function unionBox(list) {
		if (!list.length) return null; var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
		list.forEach(function (o) { var b = worldBox(o); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
		return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
	}
	function boxesTouch(a, b) { return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h; }
	function boxInside(a, b) { return a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h; }

	/* ---------- hit maths ---------- */
	function distSeg(px, py, ax, ay, bx, by) { var dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - ax - t * dx, py - ay - t * dy); }
	function distPolyline(pts, x, y) { var n = pts.length / 3, best = Infinity; if (n === 1) return Math.hypot(x - pts[0], y - pts[1]); for (var i = 0; i < n - 1; i++) best = Math.min(best, distSeg(x, y, pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 3], pts[i * 3 + 4])); return best; }

	/* ---------- paper ---------- */
	var PAPERS = [["none", "Plain"], ["grid", "Grid"], ["dots", "Dot grid"], ["lined", "Lined paper"], ["graph", "Graph paper"], ["iso", "Isometric dots"], ["music", "Music staff"], ["hex", "Hexagons"]];
	/* returns layers [{d, stroke|fill, sw}] for a w x h page */
	function paper(p, w, h) {
		var out = [], d = "", x, y, s;
		if (p === "grid") { s = 40; for (x = s; x < w; x += s) d += "M " + x + " 0 V " + h + " "; for (y = s; y < h; y += s) d += "M 0 " + y + " H " + w + " "; out.push({ d: d.trim(), stroke: "#c9d6e4", sw: 1 }); }
		else if (p === "graph") {
			s = 10; var d2 = ""; for (x = s; x < w; x += s) (x % 50 ? (d += "M " + x + " 0 V " + h + " ") : (d2 += "M " + x + " 0 V " + h + " ")); for (y = s; y < h; y += s) (y % 50 ? (d += "M 0 " + y + " H " + w + " ") : (d2 += "M 0 " + y + " H " + w + " "));
			out.push({ d: d.trim(), stroke: "#d7e6d9", sw: 0.6 }); out.push({ d: d2.trim(), stroke: "#9fc3a6", sw: 1.2 });
		}
		else if (p === "dots") { s = 30; var r = 1.8; for (y = s; y < h; y += s) for (x = s; x < w; x += s) d += ellD(x, y, r, r) + " "; out.push({ d: d.trim(), fill: "#a9b4c2" }); }
		else if (p === "iso") { s = 34; var rr = 1.7, row = 0; for (y = s * 0.6; y < h; y += s * 0.866, row++) for (x = (row % 2 ? s / 2 : 0) + s / 2; x < w; x += s) d += ellD(x, y, rr, rr) + " "; out.push({ d: d.trim(), fill: "#a9b4c2" }); }
		else if (p === "lined") { s = 36; for (y = s * 2.5; y < h; y += s) d += "M 0 " + r2(y) + " H " + w + " "; out.push({ d: d.trim(), stroke: "#a9c7ea", sw: 1.2 }); out.push({ d: "M 90 0 V " + h, stroke: "#ef9a9a", sw: 1.5 }); }
		else if (p === "music") { s = 12; var gap = 110; for (var top = 70; top + 4 * s < h - 30; top += gap) for (var k = 0; k < 5; k++) d += "M 50 " + (top + k * s) + " H " + (w - 50) + " "; out.push({ d: d.trim(), stroke: "#7d8794", sw: 1.1 }); }
		else if (p === "hex") { s = 26; var hh = s * Math.sqrt(3), c = 0; for (x = 0; x < w + s * 2; x += s * 1.5, c++) for (y = (c % 2 ? hh / 2 : 0); y < h + hh; y += hh) d += poly(regular(6, x - s, y - hh / 2, s * 2, hh, 0)) + " "; out.push({ d: d.trim(), stroke: "#cfd8e3", sw: 1 }); }
		return out;
	}

	/* ---------- page sizes ---------- */
	var SIZES = [["screen", "Screen (1600 × 1000)", 1600, 1000], ["square", "Square post (1080 × 1080)", 1080, 1080], ["thumb", "YouTube thumbnail (1280 × 720)", 1280, 720],
		["icon", "App icon (512 × 512)", 512, 512], ["story", "Phone story (1080 × 1920)", 1080, 1920], ["a4", "A4 page (1240 × 1754)", 1240, 1754], ["letter", "US Letter (1275 × 1650)", 1275, 1650],
		["banner", "Banner (1500 × 500)", 1500, 500], ["card", "Card (1500 × 1050)", 1500, 1050]];

	/* ---------- SVG writer ---------- */
	function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
	function mAttr(m) { return isId(m) ? "" : ' transform="matrix(' + m.map(r2).join(" ") + ')"'; }
	function fontStack(f) { return f || "Arial, Helvetica, sans-serif"; }
	function objSVG(o, idn) {
		var op = o.o !== undefined && o.o < 1 ? ' opacity="' + r2(o.o) + '"' : "", tf = mAttr(o.m);
		if (o.t === "path") {
			var d = esc(pathD(o));
			if (isFilledBrush(o.brush)) return '<path d="' + d + '" fill="' + esc(o.c) + '"' + op + tf + "/>";
			var cap = o.brush === "hl" ? "butt" : "round", extra = o.brush === "hl" ? ' style="mix-blend-mode:multiply"' : "", w = o.w, opa = o.brush === "pencil" ? ' opacity="' + r2((o.o === undefined ? 1 : o.o) * 0.85) + '"' : op;
			if (o.brush === "neon") return '<g' + tf + op + '><path d="' + d + '" fill="none" stroke="' + esc(o.c) + '" stroke-width="' + r2(w) + '" stroke-linecap="round" stroke-linejoin="round" filter="url(#mesglow)"/><path d="' + d + '" fill="none" stroke="#ffffff" stroke-width="' + r2(Math.max(1, w * 0.35)) + '" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/></g>';
			return '<path d="' + d + '" fill="none" stroke="' + esc(o.c) + '" stroke-width="' + r2(w) + '" stroke-linecap="' + cap + '" stroke-linejoin="round"' + opa + extra + tf + "/>";
		}
		if (o.t === "shape") {
			var dd = esc(shapeD(o.k, o.x, o.y, o.w, o.h, o.sw)), fill = o.f && !OPEN_KINDS[o.k] ? esc(o.f) : "none", st = o.c ? ' stroke="' + esc(o.c) + '" stroke-width="' + r2(o.sw || 1) + '" stroke-linecap="round" stroke-linejoin="round"' + (o.dash ? ' stroke-dasharray="' + r2((o.sw || 1) * 3) + " " + r2((o.sw || 1) * 2) + '"' : "") : "";
			return '<path d="' + dd + '" fill="' + fill + '"' + st + op + tf + "/>";
		}
		if (o.t === "text") {
			var lines = String(o.s).split("\n"), anc = o.al === "c" ? "middle" : o.al === "r" ? "end" : "start", lh = o.size * 1.2, out = "";
			var b = o.tw ? { w: o.tw, h: o.th } : estText(o);
			if (o.bgc) { var bx = o.x + (o.al === "c" ? -b.w / 2 : o.al === "r" ? -b.w : 0), pad = o.size * 0.25; out += '<rect x="' + r2(bx - pad) + '" y="' + r2(o.y - pad) + '" width="' + r2(b.w + 2 * pad) + '" height="' + r2(b.h + 2 * pad) + '" rx="' + r2(pad) + '" fill="' + esc(o.bgc) + '"/>'; }
			var attrs = ' font-family="' + esc(fontStack(o.font)) + '" font-size="' + r2(o.size) + '"' + (o.b ? ' font-weight="700"' : "") + (o.i ? ' font-style="italic"' : "") + ' text-anchor="' + anc + '" fill="' + esc(o.c) + '"' +
				(o.sc ? ' stroke="' + esc(o.sc) + '" stroke-width="' + r2(Math.max(2, o.size * 0.08)) + '" paint-order="stroke" stroke-linejoin="round"' : "");
			out += "<text" + attrs + ">" + lines.map(function (l, i) { return '<tspan x="' + r2(o.x) + '" y="' + r2(o.y + i * lh + o.size * 0.92) + '">' + esc(l) + "</tspan>"; }).join("") + "</text>";
			return "<g" + tf + op + ">" + out + "</g>";
		}
		if (o.t === "img") return '<image href="' + esc(o.src) + '" x="' + r2(o.x) + '" y="' + r2(o.y) + '" width="' + r2(o.w) + '" height="' + r2(o.h) + '" preserveAspectRatio="none"' + op + tf + "/>";
		return "";
	}
	/* opts: {bg: true (draw the background colour), paper: true (draw the pattern)} */
	function toSVG(doc, opts) {
		opts = opts || {}; var W = doc.w, H = doc.h, defs = '<filter id="mesglow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>', body = "", maskN = 0;
		var back = "";
		if (opts.bg !== false && doc.bg && doc.bg.c) back += '<rect width="' + W + '" height="' + H + '" fill="' + esc(doc.bg.c) + '"/>';
		if (opts.paper !== false && doc.bg && doc.bg.p && doc.bg.p !== "none") paper(doc.bg.p, W, H).forEach(function (l) { back += '<path d="' + l.d + '" ' + (l.fill ? 'fill="' + l.fill + '"' : 'fill="none" stroke="' + l.stroke + '" stroke-width="' + l.sw + '"') + "/>"; });
		(doc.objs || []).forEach(function (o) {
			if (o.t === "path" && o.brush === "erase") {
				var id = "mesm" + (++maskN);
				defs += '<mask id="' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><rect width="' + W + '" height="' + H + '" fill="#fff"/><path d="' + esc(lineD(o.pts)) + '" fill="none" stroke="#000" stroke-width="' + r2(o.w) + '" stroke-linecap="round" stroke-linejoin="round"' + mAttr(o.m) + "/></mask>";
				body = '<g mask="url(#' + id + ')">' + body + "</g>";
			} else body += objSVG(o);
		});
		return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '"><defs>' + defs + "</defs>" + back + body + "</svg>";
	}

	/* ---------- building blocks for templates ---------- */
	function S(k, x, y, w, h, o) { o = o || {}; return { t: "shape", k: k, x: x, y: y, w: w, h: h, c: o.c === undefined ? "#1e1e1e" : o.c, sw: o.sw === undefined ? 4 : o.sw, f: o.f === undefined ? null : o.f, dash: !!o.dash, o: o.o === undefined ? 1 : o.o, m: o.m || I.slice() }; }
	function T(s, x, y, size, o) { o = o || {}; return { t: "text", s: s, x: x, y: y, size: size, font: o.font || "Arial, Helvetica, sans-serif", c: o.c || "#1e1e1e", b: !!o.b, i: !!o.i, al: o.al || "l", sc: o.sc || null, bgc: o.bgc || null, o: 1, m: o.m || I.slice() }; }
	function E(ch, x, y, size, o) { var t = T(ch, x, y, size, o); t.font = "\"Apple Color Emoji\", \"Segoe UI Emoji\", \"Noto Color Emoji\", sans-serif"; t.al = "c"; return t; }
	function Pth(pts, w, c, brush) { var a = []; pts.forEach(function (p) { a.push(p[0], p[1], 0.5); }); return { t: "path", brush: brush || "marker", pts: a, c: c, w: w, o: 1, m: I.slice() }; }
	function arcPts(cx, cy, r, a0, a1, n) { var out = []; for (var i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } return out; }
	function doc(w, h, objs, bg, p) { return { w: w, h: h, bg: { c: bg === undefined ? "#ffffff" : bg, p: p || "none" }, objs: objs || [] }; }
	var OUT = { c: "#1e1e1e", sw: 4, f: "#ffffff" }; // coloring-page outlines

	var TEMPLATES = [
		/* paper */
		{ id: "blank", cat: "Paper", name: "Blank page", make: function () { return doc(1600, 1000, []); } },
		{ id: "grid", cat: "Paper", name: "Grid paper", make: function () { return doc(1600, 1000, [], "#ffffff", "grid"); } },
		{ id: "dots", cat: "Paper", name: "Dot grid", make: function () { return doc(1600, 1000, [], "#ffffff", "dots"); } },
		{ id: "lined", cat: "Paper", name: "Lined paper", make: function () { return doc(1240, 1754, [], "#ffffff", "lined"); } },
		{ id: "graph", cat: "Paper", name: "Graph paper", make: function () { return doc(1240, 1754, [], "#ffffff", "graph"); } },
		{ id: "iso", cat: "Paper", name: "Isometric dots", make: function () { return doc(1600, 1000, [], "#ffffff", "iso"); } },
		{ id: "music", cat: "Paper", name: "Music staff", make: function () { return doc(1240, 1754, [], "#ffffff", "music"); } },
		{ id: "chalk", cat: "Paper", name: "Chalkboard", make: function () { return doc(1600, 1000, [T("Today's lesson", 80, 60, 64, { c: "#f1f3ee", font: "\"Comic Sans MS\", \"Chalkboard SE\", cursive" })], "#25443a"); } },
		{ id: "transparent", cat: "Paper", name: "Transparent (for stickers)", make: function () { return doc(1000, 1000, [], null); } },
		/* layouts */
		{ id: "comic3", cat: "Layouts", name: "Comic strip (3 panels)", make: function () { return doc(1800, 640, [S("rect", 30, 30, 560, 580, { sw: 6 }), S("rect", 620, 30, 560, 580, { sw: 6 }), S("rect", 1210, 30, 560, 580, { sw: 6 }), S("bubble", 70, 60, 300, 170, { sw: 4, f: "#ffffff" })]); } },
		{ id: "comic6", cat: "Layouts", name: "Comic page (6 panels)", make: function () { var o = [], W = 1240, H = 1754; for (var r = 0; r < 3; r++) for (var c = 0; c < 2; c++) o.push(S("rect", 40 + c * 590, 40 + r * 560, 570, 540, { sw: 6 })); return doc(W, H, o); } },
		{ id: "story", cat: "Layouts", name: "Storyboard (6 frames)", make: function () { var o = [], i; for (i = 0; i < 6; i++) { var c = i % 3, r = Math.floor(i / 3), x = 50 + c * 510, y = 60 + r * 470; o.push(S("rect", x, y, 470, 280, { sw: 4 })); o.push(T((i + 1) + ".", x, y + 300, 30, { b: true })); o.push(S("line", x + 40, y + 340, 430, 0, { sw: 2, c: "#9aa3ad" })); o.push(S("line", x, y + 385, 470, 0, { sw: 2, c: "#9aa3ad" })); } return doc(1600, 1000, o); } },
		{ id: "mind", cat: "Layouts", name: "Mind map", make: function () {
			var o = [], cx = 800, cy = 500, cols = ["#e03131", "#f08c00", "#2f9e44", "#1971c2", "#7048e8", "#c2255c"];
			for (var i = 0; i < 6; i++) { var a = -Math.PI / 2 + i * Math.PI / 3, x = cx + Math.cos(a) * 360, y = cy + Math.sin(a) * 300; o.push(Pth([[cx, cy], [(cx + x) / 2 + Math.sin(a) * 30, (cy + y) / 2 - Math.cos(a) * 30], [x, y]], 6, cols[i])); o.push(S("round", x - 120, y - 45, 240, 90, { c: cols[i], sw: 4, f: "#ffffff" })); o.push(T("Idea " + (i + 1), x, y - 18, 32, { al: "c", c: cols[i], b: true })); }
			o.push(S("ellipse", cx - 170, cy - 80, 340, 160, { c: "#1e1e1e", sw: 5, f: "#fff3bf" })); o.push(T("Main topic", cx, cy - 22, 44, { al: "c", b: true })); return doc(1600, 1000, o);
		} },
		{ id: "flow", cat: "Layouts", name: "Flowchart", make: function () {
			return doc(1600, 1000, [S("ellipse", 650, 40, 300, 110, { f: "#d3f9d8", c: "#2f9e44" }), T("Start", 800, 75, 36, { al: "c", b: true }), S("arrow", 800, 150, 0, 70, { sw: 4 }),
				S("rect", 625, 230, 350, 120, { f: "#d0ebff", c: "#1971c2" }), T("Do something", 800, 270, 34, { al: "c" }), S("arrow", 800, 350, 0, 70, { sw: 4 }),
				S("diamond", 610, 430, 380, 200, { f: "#fff3bf", c: "#f08c00" }), T("Yes or no?", 800, 510, 34, { al: "c" }), S("arrow", 990, 530, 200, 0, { sw: 4 }), T("No", 1060, 480, 28, {}),
				S("rect", 1200, 470, 300, 120, { f: "#ffe3e3", c: "#e03131" }), T("Fix it", 1350, 510, 34, { al: "c" }), S("arrow", 800, 630, 0, 90, { sw: 4 }), T("Yes", 820, 655, 28, {}),
				S("ellipse", 650, 730, 300, 110, { f: "#d3f9d8", c: "#2f9e44" }), T("End", 800, 765, 36, { al: "c", b: true })]);
		} },
		{ id: "venn2", cat: "Layouts", name: "Venn diagram (2 sets)", make: function () { return doc(1600, 1000, [S("ellipse", 330, 180, 620, 620, { c: "#1971c2", sw: 5, f: "#4dabf7", o: 0.45 }), S("ellipse", 650, 180, 620, 620, { c: "#e03131", sw: 5, f: "#ff8787", o: 0.45 }), T("A", 470, 110, 56, { b: true, c: "#1971c2" }), T("B", 1080, 110, 56, { b: true, c: "#e03131" }), T("Both", 800, 460, 40, { al: "c", b: true })]); } },
		{ id: "venn3", cat: "Layouts", name: "Venn diagram (3 sets)", make: function () { return doc(1600, 1000, [S("ellipse", 420, 80, 520, 520, { c: "#1971c2", sw: 5, f: "#4dabf7", o: 0.4 }), S("ellipse", 660, 80, 520, 520, { c: "#e03131", sw: 5, f: "#ff8787", o: 0.4 }), S("ellipse", 540, 400, 520, 520, { c: "#2f9e44", sw: 5, f: "#69db7c", o: 0.4 }), T("A", 400, 80, 52, { b: true, c: "#1971c2" }), T("B", 1170, 80, 52, { b: true, c: "#e03131" }), T("C", 1080, 860, 52, { b: true, c: "#2f9e44" })]); } },
		{ id: "axes", cat: "Layouts", name: "Coordinate plane", make: function () {
			var o = [], cx = 800, cy = 500, s = 50, i;
			for (i = -14; i <= 14; i++) if (i) { o.push(S("line", cx + i * s, 40, 0, 920, { c: "#dbe4ee", sw: 1.5 })); }
			for (i = -8; i <= 8; i++) if (i) { o.push(S("line", 60, cy + i * s, 1480, 0, { c: "#dbe4ee", sw: 1.5 })); }
			o.push(S("arrow2", 50, cy, 1500, 0, { sw: 3 })); o.push(S("arrow2", cx, 30, 0, 940, { sw: 3 })); o.push(T("x", 1520, cy + 12, 34, { i: true })); o.push(T("y", cx + 16, 24, 34, { i: true }));
			for (i = -14; i <= 14; i += 2) if (i) o.push(T(String(i), cx + i * s, cy + 12, 20, { al: "c", c: "#59616d" }));
			for (i = -8; i <= 8; i += 2) if (i) o.push(T(String(-i), cx - 14, cy + i * s - 11, 20, { al: "r", c: "#59616d" }));
			return doc(1600, 1000, o);
		} },
		{ id: "ttt", cat: "Layouts", name: "Tic-tac-toe", make: function () { return doc(1000, 1000, [S("line", 380, 120, 0, 760, { sw: 12 }), S("line", 620, 120, 0, 760, { sw: 12 }), S("line", 120, 380, 760, 0, { sw: 12 }), S("line", 120, 620, 760, 0, { sw: 12 })]); } },
		{ id: "week", cat: "Layouts", name: "Weekly planner", make: function () { var o = [T("This week", 50, 30, 56, { b: true })], days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; days.forEach(function (d, i) { var x = 40 + i * 217; o.push(S("round", x, 120, 205, 840, { sw: 3, c: "#7d8794", f: i > 4 ? "#f1f3f5" : "#ffffff" })); o.push(T(d, x + 102, 140, 34, { al: "c", b: true })); }); return doc(1600, 1000, o); } },
		{ id: "todo", cat: "Layouts", name: "To-do list", make: function () { var o = [T("To do", 90, 70, 72, { b: true })]; for (var i = 0; i < 10; i++) { o.push(S("round", 90, 200 + i * 140, 70, 70, { sw: 4 })); o.push(S("line", 200, 265 + i * 140, 900, 0, { sw: 2, c: "#adb5bd" })); } return doc(1240, 1754, o); } },
		/* sizes with a starting design */
		{ id: "thumbnail", cat: "Designs", name: "YouTube thumbnail", make: function () { return doc(1280, 720, [S("rect", 0, 0, 1280, 720, { c: null, f: "#1c7ed6" }), S("burst", 860, 120, 420, 420, { c: null, f: "#ffd43b" }), E("😮", 1070, 230, 200), T("YOUR TITLE\nHERE", 70, 170, 130, { b: true, c: "#ffffff", sc: "#111111", font: "Impact, \"Arial Black\", sans-serif" })], "#1c7ed6"); } },
		{ id: "appicon", cat: "Designs", name: "App icon", make: function () { return doc(512, 512, [S("round", 0, 0, 512, 512, { c: null, f: "#7048e8" }), E("⭐", 256, 120, 270)], null); } },
		{ id: "meme", cat: "Designs", name: "Meme (top / bottom text)", make: function () { return doc(1080, 1080, [S("rect", 40, 40, 1000, 1000, { c: "#adb5bd", sw: 3, dash: true }), T("TOP TEXT", 540, 70, 110, { al: "c", b: true, c: "#ffffff", sc: "#000000", font: "Impact, \"Arial Black\", sans-serif" }), T("BOTTOM TEXT", 540, 880, 110, { al: "c", b: true, c: "#ffffff", sc: "#000000", font: "Impact, \"Arial Black\", sans-serif" })], "#dee2e6"); } },
		{ id: "bday", cat: "Designs", name: "Birthday card", make: function () {
			var o = [S("rect", 30, 30, 1440, 990, { c: "#e64980", sw: 10, f: null })], cols = ["#ff6b6b", "#4dabf7", "#ffd43b", "#69db7c", "#b197fc"];
			cols.forEach(function (c, i) { var x = 120 + i * 85, y = 110 + (i % 2) * 70; o.push(Pth([[x + 50, y + 125], [x + 40, y + 260], [x + 75, y + 420]], 3, "#868e96")); o.push(S("ellipse", x, y, 100, 125, { c: null, f: c })); });
			o.push(T("Happy Birthday!", 980, 300, 110, { al: "c", b: true, c: "#e64980", font: "\"Comic Sans MS\", \"Chalkboard SE\", cursive" })); o.push(E("🎂", 980, 520, 260)); o.push(E("🎉", 1330, 120, 120)); return doc(1500, 1050, o, "#fff9db");
		} },
		{ id: "cert", cat: "Designs", name: "Certificate", make: function () { return doc(1600, 1130, [S("rect", 40, 40, 1520, 1050, { c: "#b08b2e", sw: 14 }), S("rect", 80, 80, 1440, 970, { c: "#d4b86a", sw: 4 }), T("Certificate of Achievement", 800, 180, 80, { al: "c", b: true, c: "#5c4813", font: "Georgia, \"Times New Roman\", serif" }), T("presented to", 800, 380, 40, { al: "c", i: true, c: "#5c4813", font: "Georgia, serif" }), T("Your Name", 800, 470, 96, { al: "c", c: "#1e1e1e", font: "\"Brush Script MT\", \"Snell Roundhand\", cursive" }), S("line", 450, 600, 700, 0, { c: "#b08b2e", sw: 3 }), T("for great work", 800, 650, 40, { al: "c", c: "#5c4813", font: "Georgia, serif" }), S("star", 720, 790, 160, 160, { c: "#b08b2e", sw: 4, f: "#ffd43b" })], "#fffbf0"); } },
		{ id: "poster", cat: "Designs", name: "Event poster", make: function () { return doc(1240, 1754, [S("rect", 0, 0, 1240, 640, { c: null, f: "#212529" }), T("BIG EVENT", 620, 170, 150, { al: "c", b: true, c: "#ffd43b", font: "Impact, \"Arial Black\", sans-serif" }), T("Saturday · 7 pm", 620, 380, 64, { al: "c", c: "#ffffff" }), E("🎸", 620, 760, 360), T("Free entry · Bring a friend", 620, 1350, 56, { al: "c", b: true }), T("Where: your place here", 620, 1460, 44, { al: "c", c: "#495057" })], "#f8f9fa"); } },
		/* examples (made of shapes, so every part can be moved, resized or recoloured) */
		{ id: "house", cat: "Examples", name: "House and sun", make: function () {
			return doc(1600, 1000, [S("rect", 0, 0, 1600, 1000, { c: null, f: "#d0ebff" }), S("ellipse", 1250, 80, 200, 200, { c: null, f: "#ffd43b" }), S("cloud", 160, 90, 330, 170, { c: null, f: "#ffffff" }), S("cloud", 700, 140, 260, 130, { c: null, f: "#ffffff" }),
				S("rect", 0, 760, 1600, 240, { c: null, f: "#69db7c" }), S("rect", 520, 470, 520, 340, { f: "#ffc078", c: "#7a4a05", sw: 5 }), S("tri", 470, 250, 620, 230, { f: "#e8590c", c: "#7a4a05", sw: 5 }),
				S("rect", 735, 610, 110, 200, { f: "#8c5a2b", c: "#5c3a12", sw: 4 }), S("rect", 580, 540, 110, 100, { f: "#e7f5ff", c: "#5c3a12", sw: 4 }), S("rect", 890, 540, 110, 100, { f: "#e7f5ff", c: "#5c3a12", sw: 4 }),
				S("rect", 1240, 600, 50, 200, { c: null, f: "#8c5a2b" }), S("ellipse", 1150, 420, 230, 230, { c: null, f: "#2f9e44" })], "#d0ebff");
		} },
		{ id: "smiley", cat: "Examples", name: "Smiley face", make: function () { return doc(1000, 1000, [S("ellipse", 150, 150, 700, 700, { f: "#ffd43b", c: "#e67700", sw: 10 }), S("ellipse", 330, 340, 90, 140, { c: null, f: "#1e1e1e" }), S("ellipse", 580, 340, 90, 140, { c: null, f: "#1e1e1e" }), Pth(arcPts(500, 470, 230, 0.35, Math.PI - 0.35, 24), 26, "#1e1e1e", "marker")]); } },
		{ id: "flower", cat: "Examples", name: "Flower", make: function () {
			var o = [Pth([[500, 560], [520, 720], [490, 950]], 18, "#2f9e44"), S("ellipse", 330, 720, 170, 70, { c: null, f: "#40c057", m: rotateAt(-0.5, 415, 755) }), S("ellipse", 520, 780, 170, 70, { c: null, f: "#40c057", m: rotateAt(0.5, 605, 815) })];
			for (var i = 0; i < 8; i++) o.push(S("ellipse", 455, 200, 90, 220, { c: "#c2255c", sw: 3, f: "#f783ac", m: rotateAt(i * Math.PI / 4, 500, 420) }));
			o.push(S("ellipse", 410, 330, 180, 180, { c: "#e67700", sw: 4, f: "#ffd43b" })); return doc(1000, 1000, o);
		} },
		{ id: "rocket", cat: "Examples", name: "Rocket", make: function () { return doc(1000, 1000, [S("tri", 340, 640, 120, 200, { f: "#e03131", c: "#1e1e1e", m: I.slice() }), S("tri", 540, 640, 120, 200, { f: "#e03131", c: "#1e1e1e" }), S("round", 400, 300, 200, 520, { f: "#e9ecef", c: "#1e1e1e" }), S("tri", 400, 120, 200, 220, { f: "#e03131", c: "#1e1e1e" }), S("ellipse", 440, 400, 120, 120, { f: "#74c0fc", c: "#1e1e1e", sw: 6 }), S("tri", 430, 820, 140, 140, { c: null, f: "#ff922b", m: mirrorY(890) }), S("star", 120, 120, 70, 70, { c: null, f: "#ffd43b" }), S("star", 800, 220, 50, 50, { c: null, f: "#ffd43b" }), S("star", 760, 700, 60, 60, { c: null, f: "#ffd43b" })], "#1c2541"); } },
		{ id: "snowman", cat: "Examples", name: "Snowman", make: function () { return doc(1000, 1000, [S("rect", 0, 820, 1000, 180, { c: null, f: "#ffffff" }), S("ellipse", 320, 560, 360, 340, { f: "#ffffff", c: "#a5b4c4" }), S("ellipse", 365, 350, 270, 250, { f: "#ffffff", c: "#a5b4c4" }), S("ellipse", 400, 170, 200, 200, { f: "#ffffff", c: "#a5b4c4" }), S("rect", 410, 60, 180, 120, { c: null, f: "#212529" }), S("rect", 370, 165, 260, 25, { c: null, f: "#212529" }), S("ellipse", 455, 235, 22, 26, { c: null, f: "#212529" }), S("ellipse", 525, 235, 22, 26, { c: null, f: "#212529" }), S("tri", 500, 265, 110, 34, { c: null, f: "#fd7e14", m: rotateAt(Math.PI / 2, 555, 282) }), S("ellipse", 488, 420, 24, 24, { c: null, f: "#212529" }), S("ellipse", 488, 480, 24, 24, { c: null, f: "#212529" })], "#a5d8ff"); } },
		{ id: "cat", cat: "Examples", name: "Cat face", make: function () { return doc(1000, 1000, [S("tri", 220, 170, 200, 260, { f: "#ffa94d", c: "#1e1e1e" }), S("tri", 580, 170, 200, 260, { f: "#ffa94d", c: "#1e1e1e" }), S("ellipse", 180, 280, 640, 560, { f: "#ffa94d", c: "#1e1e1e" }), S("ellipse", 340, 470, 80, 110, { c: null, f: "#2b8a3e" }), S("ellipse", 580, 470, 80, 110, { c: null, f: "#2b8a3e" }), S("tri", 465, 620, 70, 50, { c: null, f: "#f06595", m: mirrorY(645) }), S("line", 200, 640, 220, 20, { sw: 4 }), S("line", 200, 700, 220, -10, { sw: 4 }), S("line", 800, 640, -220, 20, { sw: 4 }), S("line", 800, 700, -220, -10, { sw: 4 })]); } },
		{ id: "land", cat: "Examples", name: "Mountain landscape", make: function () { return doc(1600, 1000, [S("rect", 0, 0, 1600, 1000, { c: null, f: "#ffe8cc" }), S("ellipse", 650, 140, 300, 300, { c: null, f: "#ff922b" }), S("tri", -100, 260, 900, 600, { c: null, f: "#5c7cfa" }), S("tri", 500, 200, 900, 660, { c: null, f: "#4263eb" }), S("tri", 1000, 330, 800, 530, { c: null, f: "#748ffc" }), S("rect", 0, 820, 1600, 180, { c: null, f: "#2b8a3e" }), S("ellipse", 300, 860, 600, 90, { c: null, f: "#74c0fc" }), S("tri", 1180, 600, 160, 260, { c: null, f: "#2f9e44" }), S("rect", 1245, 850, 30, 60, { c: null, f: "#5c3a12" }), S("tri", 1350, 640, 130, 220, { c: null, f: "#37b24d" }), S("rect", 1400, 850, 30, 60, { c: null, f: "#5c3a12" })], "#ffe8cc"); } },
		/* coloring pages (outlines only: colour them in with the paint bucket) */
		{ id: "mandala", cat: "Coloring", name: "Mandala", make: function () {
			var o = [], cx = 500, cy = 500, i;
			for (i = 0; i < 16; i++) o.push(S("ellipse", cx - 45, cy - 470, 90, 200, { c: "#1e1e1e", sw: 3, f: "#ffffff", m: rotateAt(i * Math.PI / 8, cx, cy) }));
			for (i = 0; i < 12; i++) o.push(S("ellipse", cx - 55, cy - 330, 110, 190, { c: "#1e1e1e", sw: 3, f: "#ffffff", m: rotateAt(i * Math.PI / 6 + Math.PI / 12, cx, cy) }));
			for (i = 0; i < 8; i++) o.push(S("heart", cx - 60, cy - 220, 120, 130, { c: "#1e1e1e", sw: 3, f: "#ffffff", m: rotateAt(i * Math.PI / 4, cx, cy) }));
			o.push(S("star6", cx - 95, cy - 95, 190, 190, { c: "#1e1e1e", sw: 3, f: "#ffffff" })); o.push(S("ellipse", cx - 40, cy - 40, 80, 80, { c: "#1e1e1e", sw: 3, f: "#ffffff" }));
			return doc(1000, 1000, o);
		} },
		{ id: "fish", cat: "Coloring", name: "Fish", make: function () { return doc(1200, 800, [S("tri", 820, 230, 300, 340, { c: OUT.c, sw: 5, f: "#fff", m: rotateAt(-Math.PI / 2, 970, 400) }), S("ellipse", 180, 190, 720, 420, OUT), S("tri", 440, 110, 220, 140, OUT), S("ellipse", 300, 330, 70, 70, OUT), S("ellipse", 322, 352, 26, 26, { c: null, f: "#1e1e1e" }), S("arc", 420, 300, 120, 200, { c: OUT.c, sw: 4 }), S("arc", 540, 300, 120, 200, { c: OUT.c, sw: 4 }), S("ellipse", 980, 120, 50, 50, OUT), S("ellipse", 1040, 60, 34, 34, OUT)]); } },
		{ id: "butterfly", cat: "Coloring", name: "Butterfly", make: function () { var o = [S("ellipse", 140, 140, 360, 320, OUT), S("ellipse", 200, 420, 300, 260, OUT), S("ellipse", 140, 140, 360, 320, { c: OUT.c, sw: 4, f: "#fff", m: mirrorX(500) }), S("ellipse", 200, 420, 300, 260, { c: OUT.c, sw: 4, f: "#fff", m: mirrorX(500) }), S("ellipse", 250, 220, 120, 120, OUT), S("ellipse", 630, 220, 120, 120, OUT), S("ellipse", 300, 480, 90, 90, OUT), S("ellipse", 610, 480, 90, 90, OUT), S("ellipse", 470, 160, 60, 560, OUT), Pth([[490, 170], [430, 90], [390, 60]], 4, "#1e1e1e"), Pth([[510, 170], [570, 90], [610, 60]], 4, "#1e1e1e")]; return doc(1000, 800, o); } },
		{ id: "car", cat: "Coloring", name: "Car", make: function () { return doc(1400, 800, [S("round", 140, 360, 1120, 230, OUT), S("trap", 360, 200, 640, 180, OUT), S("rect", 420, 230, 230, 130, OUT), S("rect", 700, 230, 230, 130, OUT), S("ellipse", 270, 500, 210, 210, OUT), S("ellipse", 920, 500, 210, 210, OUT), S("ellipse", 330, 560, 90, 90, OUT), S("ellipse", 980, 560, 90, 90, OUT), S("rect", 1190, 410, 70, 50, OUT), S("line", 40, 710, 1320, 0, { sw: 4 })]); } }
	];
	function template(id) { for (var i = 0; i < TEMPLATES.length; i++) if (TEMPLATES[i].id === id) return TEMPLATES[i].make(); return null; }

	/* ---------- emoji and symbols (search words after the character) ---------- */
	var EMOJI = {
		"Faces": "😀 grin happy smile|😃 smile big|😄 laugh|😁 beam grin|😆 laughing|😅 sweat|😂 tears joy lol|🤣 rofl rolling|🙂 slight smile|😉 wink|😊 blush|😇 angel halo|🥰 love hearts|😍 heart eyes|🤩 star struck|😘 kiss|😋 yum tongue|😛 tongue|😜 wink tongue|🤪 zany crazy|🤔 thinking|🤨 eyebrow|😐 neutral|😑 expressionless|😶 no mouth|🙄 eye roll|😏 smirk|😬 grimace|😌 relieved|😴 sleep|🤤 drool|😷 mask sick|🤒 thermometer sick|🤕 bandage hurt|🤢 nausea|🤮 vomit|🥵 hot|🥶 cold|😵 dizzy|🤯 mind blown exploding|🤠 cowboy|🥳 party|😎 cool sunglasses|🤓 nerd|🧐 monocle|😕 confused|😟 worried|🙁 frown|😮 wow surprised open mouth|😲 astonished|😳 flushed|🥺 pleading|😦 frowning|😨 fearful|😰 anxious|😢 cry sad|😭 sob|😱 scream|😖 confounded|😣 persevere|😞 disappointed|😓 sweat|😩 weary|😫 tired|🥱 yawn|😤 triumph steam|😡 angry pout|😠 angry|🤬 swearing|😈 devil smiling|👿 devil|💀 skull|☠️ skull bones|💩 poop|🤡 clown|👹 ogre|👻 ghost|👽 alien|🤖 robot|😺 cat smile|😹 cat joy|😻 cat heart",
		"Hands & people": "👋 wave hello|🤚 raised back hand|✋ hand stop high five|🖐️ hand fingers|👌 ok|🤌 pinched|✌️ peace victory|🤞 fingers crossed|🤟 love you|🤘 rock|🤙 call me|👈 left point|👉 right point|👆 up point|👇 down point|☝️ index up|👍 thumbs up like|👎 thumbs down dislike|✊ fist|👊 punch|👏 clap|🙌 raise hands|👐 open hands|🤲 palms|🤝 handshake deal|🙏 pray thanks please|✍️ writing|💪 muscle strong|🧠 brain|👀 eyes look|👁️ eye|👄 mouth|👶 baby|🧒 child|👦 boy|👧 girl|🧑 person|👨 man|👩 woman|🧓 older|👴 old man|👵 old woman|👮 police|👷 builder|💂 guard|🕵️ detective|👩‍⚕️ doctor|👨‍🍳 cook chef|👩‍🎓 student graduate|👨‍🏫 teacher|👩‍💻 coder laptop|👨‍🚀 astronaut|🦸 superhero|🧙 wizard|🧚 fairy|🧛 vampire|🧜 mermaid|🧝 elf|🧞 genie|🧟 zombie|🏃 run|💃 dance|🕺 dance man|🧘 yoga|🚴 bike|🏊 swim",
		"Animals & nature": "🐶 dog puppy|🐱 cat kitten|🐭 mouse|🐹 hamster|🐰 rabbit bunny|🦊 fox|🐻 bear|🐼 panda|🐨 koala|🐯 tiger|🦁 lion|🐮 cow|🐷 pig|🐸 frog|🐵 monkey|🙈 see no evil|🐔 chicken|🐧 penguin|🐦 bird|🐤 chick|🦆 duck|🦅 eagle|🦉 owl|🦇 bat|🐺 wolf|🐴 horse|🦄 unicorn|🐝 bee|🐛 bug caterpillar|🦋 butterfly|🐌 snail|🐞 ladybug|🐜 ant|🕷️ spider|🐢 turtle|🐍 snake|🦎 lizard|🦖 dinosaur t-rex|🦕 dinosaur|🐙 octopus|🦑 squid|🦀 crab|🐠 fish tropical|🐟 fish|🐬 dolphin|🐳 whale|🦈 shark|🐊 crocodile|🐘 elephant|🦒 giraffe|🦓 zebra|🐪 camel|🦘 kangaroo|🐾 paw prints|🌵 cactus|🎄 christmas tree|🌲 pine tree|🌳 tree|🌴 palm tree|🌱 seedling sprout|🌿 herb|🍀 clover luck|🍁 maple leaf|🍂 fallen leaves|🍄 mushroom|💐 bouquet|🌷 tulip|🌹 rose|🌺 hibiscus|🌸 cherry blossom|🌼 blossom|🌻 sunflower|🌞 sun face|🌝 full moon face|🌛 moon|🌙 crescent moon|⭐ star|🌟 glowing star|✨ sparkles|⚡ lightning|🔥 fire|💧 drop water|🌊 wave|🌈 rainbow|☀️ sun|⛅ cloud sun|☁️ cloud|🌧️ rain|⛈️ storm|❄️ snowflake|☃️ snowman|🌪️ tornado|🌍 earth globe|🪐 planet|☄️ comet",
		"Food & drink": "🍎 apple|🍐 pear|🍊 orange|🍋 lemon|🍌 banana|🍉 watermelon|🍇 grapes|🍓 strawberry|🫐 blueberries|🍒 cherries|🍑 peach|🥭 mango|🍍 pineapple|🥥 coconut|🥝 kiwi|🍅 tomato|🥑 avocado|🥦 broccoli|🥕 carrot|🌽 corn|🌶️ pepper hot|🥔 potato|🥐 croissant|🍞 bread|🧀 cheese|🥚 egg|🍳 cooking egg|🥞 pancakes|🥓 bacon|🍔 burger|🍟 fries|🍕 pizza|🌭 hot dog|🥪 sandwich|🌮 taco|🌯 burrito|🍝 spaghetti|🍜 ramen noodles|🍣 sushi|🍱 bento|🍤 shrimp|🍙 rice ball|🍦 ice cream|🍩 donut|🍪 cookie|🎂 birthday cake|🍰 cake|🧁 cupcake|🍫 chocolate|🍬 candy|🍭 lollipop|🍿 popcorn|☕ coffee|🍵 tea|🥤 drink cup|🧃 juice box|🥛 milk|🍺 beer|🍷 wine|🥂 cheers|🍾 champagne",
		"Activities & objects": "⚽ soccer football|🏀 basketball|🏈 american football|⚾ baseball|🎾 tennis|🏐 volleyball|🏓 ping pong|🎱 billiards 8 ball|🏒 hockey|⛳ golf|🎯 target dart|🎮 video game|🕹️ joystick|🎲 dice|♟️ chess|🧩 puzzle|🎨 art palette paint|🖌️ paintbrush|🖍️ crayon|✏️ pencil|✒️ pen|📝 memo note|📚 books|📖 book|📏 ruler|📐 triangle ruler|✂️ scissors|📌 pin|📎 paperclip|🔍 magnifier search|💡 idea bulb|🔦 flashlight|🕯️ candle|💻 laptop|🖥️ computer|⌨️ keyboard|🖱️ mouse|📱 phone|📷 camera|🎥 movie camera|📺 tv|🎙️ microphone|🎧 headphones|🎤 mic sing|🎸 guitar|🎹 piano|🥁 drum|🎺 trumpet|🎻 violin|🎵 music note|🎶 notes|🔔 bell|📣 megaphone|⏰ alarm clock|⌛ hourglass|🔑 key|🔒 lock|🧲 magnet|🔧 wrench|🔨 hammer|⚙️ gear|🧪 test tube|🔬 microscope|🔭 telescope|💊 pill|🩹 bandage|🎁 gift present|🎈 balloon|🎉 party popper|🎊 confetti|🏆 trophy|🥇 gold medal|🏅 medal|👑 crown|💎 gem diamond|💰 money bag|💵 dollar|💳 card|🛒 cart|🏠 house home|🏫 school|🏥 hospital|🏰 castle|⛺ tent|🚗 car|🚕 taxi|🚌 bus|🚓 police car|🚑 ambulance|🚒 fire truck|🚲 bicycle|🛵 scooter|🚂 train|✈️ plane|🚁 helicopter|🚀 rocket|🛸 ufo|⛵ sailboat|🚢 ship|⚓ anchor|🗺️ map|🧭 compass",
		"Hearts & signs": "❤️ red heart love|🧡 orange heart|💛 yellow heart|💚 green heart|💙 blue heart|💜 purple heart|🖤 black heart|🤍 white heart|🤎 brown heart|💔 broken heart|💕 two hearts|💖 sparkling heart|💗 growing heart|💘 cupid arrow|💝 heart ribbon|💯 hundred|💢 anger|💥 boom collision|💫 dizzy star|💦 sweat drops|💨 dash wind|💬 speech bubble|💭 thought bubble|💤 zzz sleep|✅ check yes done|☑️ ballot check|✔️ check mark|❌ cross no|❎ cross box|❓ question|❗ exclamation|‼️ double exclamation|⁉️ interrobang|⚠️ warning|🚫 prohibited no|⛔ no entry|🛑 stop|♻️ recycle|⭕ circle|🔴 red circle|🟠 orange circle|🟡 yellow circle|🟢 green circle|🔵 blue circle|🟣 purple circle|⚫ black circle|⚪ white circle|🟥 red square|🟩 green square|🟦 blue square|⬛ black square|⬜ white square|🔶 orange diamond|🔷 blue diamond|🔺 red triangle|➡️ right arrow|⬅️ left arrow|⬆️ up arrow|⬇️ down arrow|↗️ up right|↘️ down right|🔄 refresh arrows|🔝 top|🆕 new|🆗 ok|🆒 cool|🆓 free|🔟 ten|#️⃣ hash|1️⃣ one|2️⃣ two|3️⃣ three|🏁 finish flag|🚩 red flag|🏳️ white flag|🏴‍☠️ pirate flag"
	};
	var SYMBOLS = {
		"Arrows": "← left|→ right|↑ up|↓ down|↔ left right|↕ up down|↖ up left|↗ up right|↘ down right|↙ down left|⇐ double left|⇒ double right implies|⇔ iff double|⇑ double up|⇓ double down|↻ clockwise|↺ anticlockwise|⟶ long right|⟵ long left|➜ heavy right|➤ arrowhead|⤴ curve up|⤵ curve down|↩ return|↪ forward hook",
		"Math": "+ plus|− minus|× times multiply|÷ divide|± plus minus|= equals|≠ not equal|≈ approx|≡ identical|< less|> greater|≤ less equal|≥ greater equal|∞ infinity|√ root|∛ cube root|∑ sum sigma|∏ product|∫ integral|∬ double integral|∮ contour integral|∂ partial|∇ nabla|∆ delta change|∈ element of|∉ not in|⊂ subset|⊆ subset equal|∪ union|∩ intersection|∅ empty set|∀ for all|∃ exists|¬ not|∧ and|∨ or|∴ therefore|∵ because|∝ proportional|° degree|′ prime|″ double prime|‰ per mille|% percent|½ half|⅓ third|¼ quarter|¾ three quarters|² squared|³ cubed|ⁿ power n|₁ sub 1|₂ sub 2|ℕ naturals|ℤ integers|ℚ rationals|ℝ reals|ℂ complex|∠ angle|⊥ perpendicular|∥ parallel|△ triangle|□ square",
		"Greek": "α alpha|β beta|γ gamma|δ delta|ε epsilon|ζ zeta|η eta|θ theta|ι iota|κ kappa|λ lambda|μ mu|ν nu|ξ xi|π pi|ρ rho|σ sigma|τ tau|υ upsilon|φ phi|χ chi|ψ psi|ω omega|Γ Gamma|Δ Delta|Θ Theta|Λ Lambda|Ξ Xi|Π Pi|Σ Sigma|Φ Phi|Ψ Psi|Ω Omega",
		"Shapes & stars": "★ star black|☆ star white|✦ four star|✧ four star white|✪ circled star|✯ pinwheel star|❂ sun|✺ asterisk|✿ flower|❀ flower white|❁ flower|✾ flower|❖ diamond minus|◆ diamond|◇ diamond white|● circle|○ circle white|◉ fisheye|◎ bullseye|■ square|□ square white|▲ triangle up|△ triangle white|▼ triangle down|▽ triangle down white|◀ left triangle|▶ right triangle play|♥ heart|♡ heart white|♦ diamond suit|♣ club|♠ spade|☀ sun|☁ cloud|☂ umbrella|☃ snowman|☾ moon|❄ snow|☘ shamrock|⚘ flower|☮ peace|☯ yin yang|✓ check|✔ heavy check|✗ ballot x|✘ heavy x|☐ box|☑ box check|☒ box x",
		"Music & misc": "♩ quarter note|♪ eighth note|♫ beamed notes|♬ notes|♭ flat|♮ natural|♯ sharp|𝄞 treble clef|© copyright|® registered|™ trademark|§ section|¶ pilcrow|† dagger|‡ double dagger|• bullet|· middle dot|… ellipsis|— em dash|– en dash|« quote|» quote|¿ inverted question|¡ inverted exclamation|€ euro|£ pound|¥ yen|₿ bitcoin|$ dollar|¢ cent|₹ rupee|⚡ lightning|☎ phone|✉ envelope|✂ scissors|✎ pencil|✏ pencil|⌚ watch|⌛ hourglass|⚓ anchor|⚙ gear|⚖ scales|⚛ atom|☢ radioactive|☣ biohazard|♻ recycle|⚠ warning|♀ female|♂ male|⚤ male female"
	};
	function splitList(s) { return s.split("|").map(function (it) { var sp = it.indexOf(" "); return sp < 0 ? { ch: it, words: "" } : { ch: it.slice(0, sp), words: it.slice(sp + 1) }; }); }
	function search(groups, q) {
		q = String(q || "").trim().toLowerCase(); var out = [];
		Object.keys(groups).forEach(function (g) { splitList(groups[g]).forEach(function (e) { if (!q || e.words.toLowerCase().indexOf(q) >= 0 || g.toLowerCase().indexOf(q) >= 0 || e.ch === q) out.push({ ch: e.ch, words: e.words, group: g }); }); });
		return out;
	}

	/* ---------- file format ---------- */
	var KNOWN = { path: 1, shape: 1, text: 1, img: 1 };
	function cleanObj(o) {
		if (!o || !KNOWN[o.t]) return null; var c = {};
		Object.keys(o).forEach(function (k) { if (k.charAt(0) !== "_") c[k] = o[k]; });
		if (!Array.isArray(c.m) || c.m.length !== 6 || !c.m.every(fin)) c.m = I.slice();
		if (c.t === "path" && (!Array.isArray(c.pts) || !c.pts.length || !c.pts.every(fin))) return null;
		if (c.t === "img" && !/^data:image\/(png|jpeg|webp|gif|svg\+xml);/.test(String(c.src || ""))) return null;
		return c;
	}
	function serialize(d) { return JSON.stringify({ app: "mes-draw", v: 1, name: d.name || "Drawing", w: d.w, h: d.h, bg: d.bg, objs: (d.objs || []).map(cleanObj).filter(Boolean) }); }
	function parse(text) {
		var j; try { j = JSON.parse(text); } catch (e) { return null; }
		if (!j || j.app !== "mes-draw" || !fin(j.w) || !fin(j.h)) return null;
		return { name: String(j.name || "Drawing").slice(0, 80), w: Math.max(16, Math.min(8000, j.w)), h: Math.max(16, Math.min(8000, j.h)), bg: j.bg && typeof j.bg === "object" ? { c: j.bg.c || null, p: j.bg.p || "none" } : { c: "#ffffff", p: "none" }, objs: (j.objs || []).map(cleanObj).filter(Boolean) };
	}

	var api = { I: I, mul: mul, inv: inv, ap: ap, tr: tr, scaleAt: scaleAt, rotateAt: rotateAt, mirrorX: mirrorX, mirrorY: mirrorY, isId: isId, mScale: mScale, rng: rng,
		SHAPES: SHAPES, LINE_KINDS: LINE_KINDS, OPEN_KINDS: OPEN_KINDS, shapeD: shapeD, arrowHead: arrowHead, norm: norm, BRUSHES: BRUSHES, smoothPts: smoothPts, thinPts: thinPts, lineD: lineD, outlineD: outlineD, sprayD: sprayD, pathD: pathD, objD: objD, isFilledBrush: isFilledBrush,
		localBox: localBox, worldBox: worldBox, unionBox: unionBox, boxesTouch: boxesTouch, boxInside: boxInside, estText: estText, distSeg: distSeg, distPolyline: distPolyline,
		PAPERS: PAPERS, paper: paper, SIZES: SIZES, toSVG: toSVG, objSVG: objSVG, TEMPLATES: TEMPLATES, template: template, EMOJI: EMOJI, SYMBOLS: SYMBOLS, splitList: splitList, search: search,
		S: S, T: T, E: E, Pth: Pth, cleanObj: cleanObj, serialize: serialize, parse: parse };
	if (typeof module !== "undefined" && module.exports) module.exports = api;
	root.MESDraw = api;
})(typeof window !== "undefined" ? window : globalThis);
