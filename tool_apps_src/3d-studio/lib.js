/* MES 3D Studio: pure maths (no three.js, no DOM). Runs in the browser (window.MES3D) and in node (require).
 * Units are millimetres, Z is up. A "triangle soup" is a Float32Array of x,y,z for 3 vertices per triangle.
 * Tests: node tool_apps_src/3d-studio-tests.js */
(function (root) {
	'use strict';

	// ---------- build plates (mm, x = width, y = depth, z = height) ----------
	var PLATES = [
		{ id: 'ender3', name: 'Creality Ender 3 / V2 / Pro', x: 220, y: 220, z: 250 },
		{ id: 'ender3v3', name: 'Creality Ender 3 V3 / SE / KE', x: 220, y: 220, z: 250 },
		{ id: 'k1', name: 'Creality K1 / K1C', x: 220, y: 220, z: 250 },
		{ id: 'mk4', name: 'Prusa MK4 / MK4S / MK3S', x: 250, y: 210, z: 220 },
		{ id: 'mini', name: 'Prusa MINI', x: 180, y: 180, z: 180 },
		{ id: 'xl', name: 'Prusa XL', x: 360, y: 360, z: 360 },
		{ id: 'a1', name: 'Bambu Lab A1', x: 256, y: 256, z: 256 },
		{ id: 'a1mini', name: 'Bambu Lab A1 mini', x: 180, y: 180, z: 180 },
		{ id: 'x1', name: 'Bambu Lab X1 / P1S / P1P', x: 256, y: 256, z: 256 },
		{ id: 'neptune4', name: 'Elegoo Neptune 4 / 4 Pro', x: 225, y: 225, z: 265 },
		{ id: 'mars', name: 'Elegoo Mars 4 (resin)', x: 153, y: 77, z: 175 },
		{ id: 'custom', name: 'Custom size', x: 200, y: 200, z: 200 }
	];
	function plateById(id, custom) {
		for (var i = 0; i < PLATES.length; i++) if (PLATES[i].id === id) {
			if (id === 'custom' && custom) return { id: 'custom', name: 'Custom size', x: +custom.x || 200, y: +custom.y || 200, z: +custom.z || 200 };
			return PLATES[i];
		}
		return PLATES[0];
	}

	// ---------- filament materials (density g/cm³, typical price per kg in your currency) ----------
	var MATERIALS = [
		{ id: 'pla', name: 'PLA', density: 1.24, price: 22 },
		{ id: 'petg', name: 'PETG', density: 1.27, price: 24 },
		{ id: 'abs', name: 'ABS', density: 1.04, price: 22 },
		{ id: 'asa', name: 'ASA', density: 1.07, price: 28 },
		{ id: 'tpu', name: 'TPU (flexible)', density: 1.21, price: 32 },
		{ id: 'nylon', name: 'Nylon (PA)', density: 1.14, price: 40 },
		{ id: 'pc', name: 'Polycarbonate', density: 1.20, price: 38 },
		{ id: 'resin', name: 'Standard resin', density: 1.12, price: 30, resin: true }
	];
	function materialById(id) { for (var i = 0; i < MATERIALS.length; i++) if (MATERIALS[i].id === id) return MATERIALS[i]; return MATERIALS[0]; }

	// ---------- lengths ----------
	var UNITS = { mm: 1, cm: 10, m: 1000, 'in': 25.4, '"': 25.4, inch: 25.4, inches: 25.4, ft: 304.8, "'": 304.8 };
	// "20", "2 cm", "1in", '1"', "1/2 in", "10*2 + 5", "-3.5mm", "1,5" (decimal comma). Returns mm, or NaN.
	function parseLength(str, unit) {
		var base = UNITS[unit] || 1;
		var s = String(str == null ? '' : str).trim().toLowerCase().replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ')
			.replace(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/g, function (m, a, b) { return String(+a / +b); });
		if (!s) return NaN;
		var i = 0;
		function ws() { while (s[i] === ' ') i++; }
		function num() {
			ws();
			var m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/.exec(s.slice(i));
			if (!m) return NaN;
			i += m[0].length;
			var v = parseFloat(m[0]);
			ws();
			var u = /^(mm|cm|inches|inch|in|ft|m(?![a-z])|"|')/.exec(s.slice(i));
			if (u) { i += u[0].length; return v * UNITS[u[0]]; }
			return { raw: v };
		}
		function factor() {
			ws();
			if (s[i] === '-') { i++; var f = factor(); return neg(f); }
			if (s[i] === '+') { i++; return factor(); }
			if (s[i] === '(') { i++; var v = expr(); ws(); if (s[i] !== ')') return NaN; i++; return v; }
			return num();
		}
		function neg(v) { return typeof v === 'object' ? { raw: -v.raw } : -v; }
		function val(v) { return typeof v === 'object' ? v.raw * base : v; }
		function term() {
			var a = factor();
			for (;;) {
				ws();
				var op = s[i];
				if (op !== '*' && op !== '/' && op !== 'x' && op !== '×') return a;
				i++;
				var b = factor();
				// a number times a unitless number keeps the unit of the first ("1/2 in" -> (1/2) in handled below)
				var bv = typeof b === 'object' ? b.raw : b / base;
				if (typeof a === 'object') a = op === '/' ? { raw: a.raw / bv } : { raw: a.raw * bv };
				else a = op === '/' ? a / bv : a * bv;
			}
		}
		function expr() {
			var a = term();
			for (;;) {
				ws();
				var op = s[i];
				if (op !== '+' && op !== '-') return a;
				i++;
				var b = term();
				if (typeof a === 'object' && typeof b === 'object') a = { raw: op === '+' ? a.raw + b.raw : a.raw - b.raw };
				else a = op === '+' ? val(a) + val(b) : val(a) - val(b);
			}
		}
		var r = expr();
		ws();
		if (i < s.length) {
			// a trailing unit after an expression: "1/2 in", "(10+5) cm"
			var u = /^(mm|cm|inches|inch|in|ft|m|"|')$/.exec(s.slice(i).trim());
			if (u && typeof r === 'object') return r.raw * UNITS[u[1]];
			return NaN;
		}
		var out = val(r);
		return isFinite(out) ? out : NaN;
	}
	function fmtLength(mm, unit, digits) {
		if (!isFinite(mm)) return '–';
		var d = digits == null ? 2 : digits;
		if (unit === 'in') return trim((mm / 25.4).toFixed(d + 1)) + ' in';
		if (unit === 'cm') return trim((mm / 10).toFixed(d)) + ' cm';
		return trim(mm.toFixed(d)) + ' mm';
	}
	function trim(s) { return s.indexOf('.') < 0 ? s : s.replace(/\.?0+$/, ''); }
	function fmtNum(v, d) { return isFinite(v) ? trim(v.toFixed(d == null ? 2 : d)) : '–'; }
	function snap(v, step) { if (!step) return v; return Math.round(v / step) * step; }

	// ---------- triangle soups ----------
	function bboxOf(pos) {
		var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
		for (var i = 0; i < pos.length; i += 3) for (var k = 0; k < 3; k++) { var v = pos[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
		return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
	}
	// signed volume (positive when the triangles face outwards) and surface area
	function volumeArea(pos) {
		var v = 0, a = 0;
		for (var i = 0; i + 8 < pos.length; i += 9) {
			var ax = pos[i], ay = pos[i + 1], az = pos[i + 2], bx = pos[i + 3], by = pos[i + 4], bz = pos[i + 5], cx = pos[i + 6], cy = pos[i + 7], cz = pos[i + 8];
			v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
			var ux = bx - ax, uy = by - ay, uz = bz - az, wx = cx - ax, wy = cy - ay, wz = cz - az;
			var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
			a += Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
		}
		return { volume: v / 6, area: a };
	}
	// reverse every triangle (inside-out fix), in place
	function flipWinding(pos) {
		for (var i = 0; i + 8 < pos.length; i += 9) for (var k = 0; k < 3; k++) { var t = pos[i + 3 + k]; pos[i + 3 + k] = pos[i + 6 + k]; pos[i + 6 + k] = t; }
		return pos;
	}
	// weld vertices that are closer than tol (grid hashing), returns { index: Uint32Array (3 per triangle), verts: Float64Array }
	function weld(pos, tol) {
		var t = tol || 1e-4, inv = 1 / t, map = new Map(), verts = [], index = new Uint32Array(pos.length / 3);
		for (var i = 0, n = 0; i < pos.length; i += 3, n++) {
			var kx = Math.round(pos[i] * inv), ky = Math.round(pos[i + 1] * inv), kz = Math.round(pos[i + 2] * inv);
			var key = kx + ',' + ky + ',' + kz, id = map.get(key);
			if (id === undefined) { id = verts.length / 3; map.set(key, id); verts.push(pos[i], pos[i + 1], pos[i + 2]); }
			index[n] = id;
		}
		return { index: index, verts: new Float64Array(verts) };
	}
	/* Is the mesh closed ("watertight") so a slicer can fill it?
	 * Every edge of a closed, consistently oriented surface is used by exactly two triangles, once in each direction.
	 * boundary = edges with one triangle (holes in the surface), nonManifold = edges with 3 or more,
	 * flipped = edges used twice in the same direction (a triangle facing the wrong way), shells = connected pieces. */
	function manifoldCheck(pos, tol) {
		var w = weld(pos, tol), idx = w.index, nv = w.verts.length / 3;
		var edges = new Map(), tris = 0, degenerate = 0;
		var parent = new Int32Array(nv); for (var p = 0; p < nv; p++) parent[p] = p;
		function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
		function union(a, b) { a = find(a); b = find(b); if (a !== b) parent[a] = b; }
		function add(a, b) {
			var lo = a < b ? a : b, hi = a < b ? b : a, key = lo * 4294967296 + hi, e = edges.get(key);
			if (!e) { e = [0, 0]; edges.set(key, e); }
			if (a < b) e[0]++; else e[1]++;
		}
		for (var i = 0; i < idx.length; i += 3) {
			var a = idx[i], b = idx[i + 1], c = idx[i + 2];
			if (a === b || b === c || a === c) { degenerate++; continue; }
			tris++;
			add(a, b); add(b, c); add(c, a);
			union(a, b); union(b, c);
		}
		var boundary = 0, nonManifold = 0, flipped = 0, open = [];
		edges.forEach(function (e, key) {
			var n = e[0] + e[1];
			if (n === 1) { boundary++; var lo = Math.floor(key / 4294967296), hi = key - lo * 4294967296; open.push(e[0] ? [lo, hi] : [hi, lo]); }
			else if (n > 2) nonManifold++;
			else if (e[0] !== 1) flipped++;
		});
		var seams = open.length ? seamCover(open, w.verts, tol) : { gaps: 0, gapLength: 0 };
		var roots = new Set();
		for (var j = 0; j < idx.length; j += 3) {
			if (idx[j] === idx[j + 1] || idx[j + 1] === idx[j + 2] || idx[j] === idx[j + 2]) continue;
			roots.add(find(idx[j]));
		}
		return { triangles: tris, vertices: nv, edges: edges.size, boundary: boundary, nonManifold: nonManifold, flipped: flipped, degenerate: degenerate, shells: roots.size,
			tjunctions: boundary - seams.gaps, gaps: seams.gaps, gapLength: seams.gapLength,
			closed: tris > 0 && seams.gaps === 0 && nonManifold === 0 && flipped === 0 };
	}
	/* Boolean (CSG) results often have "T-junctions": a long edge on one side of a seam meets two or more shorter edges on the
	 * other side. Every one of those edges is used by one triangle only, yet the surface has no gap. This checks each straight
	 * line of open edges: the edges running one way must cover exactly the same stretch as the edges running the other way.
	 * open = directed edges [from, to] (vertex indices), verts = welded positions. Returns how many open edges are real gaps. */
	function seamCover(open, verts, tol) {
		var E = [], lens = [];
		open.forEach(function (e) {
			var a = [verts[e[0] * 3], verts[e[0] * 3 + 1], verts[e[0] * 3 + 2]], b = [verts[e[1] * 3], verts[e[1] * 3 + 1], verts[e[1] * 3 + 2]];
			var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
			if (l) { E.push({ a: a, b: b, d: [d[0] / l, d[1] / l, d[2] / l], l: l }); lens.push(l); }
		});
		lens.sort(function (x, y) { return x - y; });
		var cell = Math.min(5, Math.max(0.25, lens[lens.length >> 1] || 1)), grid = new Map(), near = Math.max(1e-3, (tol || 1e-4) * 10);
		function k(x, y, z) { return x + ',' + y + ',' + z; }
		E.forEach(function (e, i) {
			var lo = [0, 1, 2].map(function (j) { return Math.floor((Math.min(e.a[j], e.b[j]) - near) / cell); }), hi = [0, 1, 2].map(function (j) { return Math.floor((Math.max(e.a[j], e.b[j]) + near) / cell); });
			var n = (hi[0] - lo[0] + 1) * (hi[1] - lo[1] + 1) * (hi[2] - lo[2] + 1);
			if (n > 4000) { var keyL = 'L'; if (!grid.has(keyL)) grid.set(keyL, []); grid.get(keyL).push(i); return; }   // very long edge: checked against everything
			for (var x = lo[0]; x <= hi[0]; x++) for (var y = lo[1]; y <= hi[1]; y++) for (var z = lo[2]; z <= hi[2]; z++) { var kk = k(x, y, z), c = grid.get(kk); if (!c) { c = []; grid.set(kk, c); } c.push(i); }
		});
		var longs = grid.get('L') || [];
		function onSeg(p, f) {
			var t = (p[0] - f.a[0]) * f.d[0] + (p[1] - f.a[1]) * f.d[1] + (p[2] - f.a[2]) * f.d[2];
			if (t < -near || t > f.l + near) return false;
			var qx = f.a[0] + f.d[0] * t - p[0], qy = f.a[1] + f.d[1] * t - p[1], qz = f.a[2] + f.d[2] * t - p[2];
			return qx * qx + qy * qy + qz * qz < near * near;
		}
		var gaps = 0, gapLength = 0;
		E.forEach(function (e, i) {
			var covered = [0.15, 0.5, 0.85].every(function (t) {
				var p = [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t, e.a[2] + (e.b[2] - e.a[2]) * t];
				var cand = (grid.get(k(Math.floor(p[0] / cell), Math.floor(p[1] / cell), Math.floor(p[2] / cell))) || []).concat(longs);
				return cand.some(function (j) { if (j === i) return false; var f = E[j]; return e.d[0] * f.d[0] + e.d[1] * f.d[1] + e.d[2] * f.d[2] < -0.995 && onSeg(p, f); });
			});
			if (!covered) { gaps++; gapLength += e.l; }
		});
		return { gaps: gaps, gapLength: gapLength };
	}
	/* Faces that point down more steeply than `maxAngle` degrees from vertical need supports when printed (45° is the usual rule).
	 * Faces lying on the floor (all three corners within floorTol of floorZ) are the first layer, not an overhang. */
	function overhang(pos, maxAngle, floorZ, floorTol) {
		var lim = Math.cos((90 - (maxAngle == null ? 45 : maxAngle)) * Math.PI / 180), fz = floorZ || 0, ft = floorTol == null ? 0.05 : floorTol;
		var nt = Math.floor(pos.length / 9), flags = new Uint8Array(nt), area = 0, total = 0;
		for (var t = 0, i = 0; t < nt; t++, i += 9) {
			var ux = pos[i + 3] - pos[i], uy = pos[i + 4] - pos[i + 1], uz = pos[i + 5] - pos[i + 2], wx = pos[i + 6] - pos[i], wy = pos[i + 7] - pos[i + 1], wz = pos[i + 8] - pos[i + 2];
			var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, len = Math.sqrt(nx * nx + ny * ny + nz * nz);
			if (!len) continue;
			total += len / 2;
			if (-nz / len > lim) {
				var onFloor = pos[i + 2] - fz < ft && pos[i + 5] - fz < ft && pos[i + 8] - fz < ft;
				if (!onFloor) { flags[t] = 1; area += len / 2; }
			}
		}
		return { flags: flags, area: area, total: total, fraction: total ? area / total : 0 };
	}
	// does a bounding box (min/max) fit the plate centred on the origin (x, y in -W/2..W/2) and the build height?
	function plateFit(bb, plate, margin) {
		var m = margin || 0, hx = plate.x / 2 - m, hy = plate.y / 2 - m;
		var over = {
			left: Math.max(0, -hx - bb.min[0]), right: Math.max(0, bb.max[0] - hx),
			front: Math.max(0, -hy - bb.min[1]), back: Math.max(0, bb.max[1] - hy),
			top: Math.max(0, bb.max[2] - plate.z), below: Math.max(0, -bb.min[2])
		};
		var sx = bb.max[0] - bb.min[0], sy = bb.max[1] - bb.min[1], sz = bb.max[2] - bb.min[2];
		var fitsSize = sx <= plate.x - 2 * m + 1e-6 && sy <= plate.y - 2 * m + 1e-6 && sz <= plate.z + 1e-6;
		var rotated = !fitsSize && sy <= plate.x - 2 * m + 1e-6 && sx <= plate.y - 2 * m + 1e-6 && sz <= plate.z + 1e-6;
		var inside = over.left + over.right + over.front + over.back + over.top < 1e-6;
		return { fits: inside && over.below < 1e-3, inside: inside, fitsSize: fitsSize, fitsIfTurned: rotated, floating: bb.min[2] > 0.01, below: over.below > 1e-3, over: over };
	}
	/* Filament estimate. volume, area in mm³ / mm². The outside shell (walls + top/bottom) is solid: about area × wall,
	 * the rest is filled at the infill percentage. Returns used plastic volume, grams, metres of filament and cost. */
	function filament(va, opt) {
		var o = opt || {}, mat = materialById(o.material), vol = Math.max(0, va.volume), area = Math.max(0, va.area);
		var wall = o.wall == null ? 0.8 : o.wall, infill = (o.infill == null ? 15 : o.infill) / 100;
		var shell = Math.min(vol, area * wall), used = mat.resin ? vol : shell + (vol - shell) * infill;
		var d = o.diameter || 1.75, grams = used / 1000 * mat.density;
		var metres = mat.resin ? 0 : used / (Math.PI * d * d / 4) / 1000;
		var price = o.price == null ? mat.price : o.price;
		var flow = o.flow || 8;           // mm³ per second the printer really pushes on average
		var hours = used / (flow * 0.55) / 3600;
		return { used: used, shell: shell, grams: grams, metres: metres, cost: grams / 1000 * price, hours: hours, material: mat };
	}

	// ---------- 2D shapes (counter-clockwise point lists in mm) ----------
	function polyArea(pts) { var a = 0; for (var i = 0; i < pts.length; i++) { var p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; }
	function ccw(pts) { return polyArea(pts) < 0 ? pts.slice().reverse() : pts.slice(); }
	function circlePts(r, n, cx, cy) { var o = [], k = n || 48; for (var i = 0; i < k; i++) { var a = i / k * Math.PI * 2; o.push([(cx || 0) + r * Math.cos(a), (cy || 0) + r * Math.sin(a)]); } return o; }
	function roundedRect(w, h, r, seg) {
		var rr = Math.max(0, Math.min(r, w / 2 - 1e-6, h / 2 - 1e-6)), s = seg || 8, o = [], cs = [[w / 2 - rr, h / 2 - rr, 0], [-w / 2 + rr, h / 2 - rr, 90], [-w / 2 + rr, -h / 2 + rr, 180], [w / 2 - rr, -h / 2 + rr, 270]];
		if (rr < 1e-6) return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
		cs.forEach(function (c) { for (var i = 0; i <= s; i++) { var a = (c[2] + i / s * 90) * Math.PI / 180; o.push([c[0] + rr * Math.cos(a), c[1] + rr * Math.sin(a)]); } });
		return o;
	}
	function starPts(points, rOut, rIn) { var o = [], n = Math.max(3, points | 0); for (var i = 0; i < n * 2; i++) { var a = Math.PI / 2 + i / (n * 2) * Math.PI * 2, r = i % 2 ? rIn : rOut; o.push([r * Math.cos(a), r * Math.sin(a)]); } return o; }
	function heartPts(size, n) {
		var o = [], k = n || 72;
		for (var i = 0; i < k; i++) { var t = i / k * Math.PI * 2; o.push([16 * Math.pow(Math.sin(t), 3), 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)]); }
		var bb = bounds2(o), s = size / Math.max(bb.w, bb.h), cx = (bb.minx + bb.maxx) / 2, cy = (bb.miny + bb.maxy) / 2;
		return ccw(o.map(function (p) { return [(p[0] - cx) * s, (p[1] - cy) * s]; }));
	}
	function polygonPts(sides, r) { var o = [], n = Math.max(3, sides | 0); for (var i = 0; i < n; i++) { var a = Math.PI / 2 + i / n * Math.PI * 2; o.push([r * Math.cos(a), r * Math.sin(a)]); } return o; }
	// spur gear outline with trapezoid teeth: module m (tooth size), z teeth. Pitch radius = m z / 2, tip = +m, root = -1.25 m.
	function gearPts(teeth, mod) {
		var z = Math.max(6, teeth | 0), m = mod || 2, rp = m * z / 2, ra = rp + m, rf = Math.max(m, rp - 1.25 * m), o = [];
		for (var i = 0; i < z; i++) {
			var a0 = i / z * Math.PI * 2, step = Math.PI * 2 / z;
			var f = [[0, rf], [0.18, rf], [0.30, ra], [0.50, ra], [0.62, rf], [0.82, rf]];
			for (var k = 0; k < f.length; k++) { var a = a0 + f[k][0] * step; o.push([f[k][1] * Math.cos(a), f[k][1] * Math.sin(a)]); }
		}
		return { pts: o, pitch: rp, tip: ra, root: rf };
	}
	function bounds2(pts) { var b = { minx: Infinity, miny: Infinity, maxx: -Infinity, maxy: -Infinity }; pts.forEach(function (p) { if (p[0] < b.minx) b.minx = p[0]; if (p[0] > b.maxx) b.maxx = p[0]; if (p[1] < b.miny) b.miny = p[1]; if (p[1] > b.maxy) b.maxy = p[1]; }); b.w = b.maxx - b.minx; b.h = b.maxy - b.miny; return b; }
	// move every corner of a counter-clockwise polygon outwards by d (inwards when d < 0); simple miter offset, fine for smooth outlines
	function offsetPolygon(pts, d) {
		var p = ccw(pts), n = p.length, o = [];
		for (var i = 0; i < n; i++) {
			var a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n];
			var e1 = norm2([b[0] - a[0], b[1] - a[1]]), e2 = norm2([c[0] - b[0], c[1] - b[1]]);
			var n1 = [e1[1], -e1[0]], n2 = [e2[1], -e2[0]], m = norm2([n1[0] + n2[0], n1[1] + n2[1]]);
			var cos = m[0] * n1[0] + m[1] * n1[1], k = d / Math.max(0.3, cos);
			o.push([b[0] + m[0] * k, b[1] + m[1] * k]);
		}
		return o;
	}
	function norm2(v) { var l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
	// a lathe profile (r, z) must stay on the right of the axis
	function cleanProfile(pts) { return pts.filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); }).map(function (p) { return [Math.max(0, +p[0]), +p[1]]; }); }

	// ---------- 3MF (the 3D-printing format with units and colours) ----------
	function hex6(c) { var m = /^#?([0-9a-f]{6})$/i.exec(String(c || '')); return m ? '#' + m[1].toUpperCase() : '#9CA3AF'; }
	function xmlEsc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]; }); }
	function n6(v) { return trim(v.toFixed(5)); }
	/* objects: [{name, positions (triangle soup, mm), color '#rrggbb'}] -> the 3D/3dmodel.model XML */
	function threeMFModel(objects, title) {
		var mats = [], matIndex = {};
		objects.forEach(function (o) { var c = hex6(o.color); if (matIndex[c] == null) { matIndex[c] = mats.length; mats.push(c); } });
		var out = ['<?xml version="1.0" encoding="UTF-8"?>',
			'<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
			' <metadata name="Title">' + xmlEsc(title || 'MES 3D Studio model') + '</metadata>',
			' <metadata name="Application">MES 3D Studio (mes.fm/3d-studio)</metadata>',
			' <resources>',
			'  <basematerials id="1">' + mats.map(function (c, i) { return '<base name="Colour ' + (i + 1) + '" displaycolor="' + c + '" />'; }).join('') + '</basematerials>'];
		var ids = [];
		objects.forEach(function (o, k) {
			var w = weld(o.positions, 1e-5), id = k + 2, v = w.verts, idx = w.index, vs = [], ts = [];
			ids.push(id);
			for (var i = 0; i < v.length; i += 3) vs.push('<vertex x="' + n6(v[i]) + '" y="' + n6(v[i + 1]) + '" z="' + n6(v[i + 2]) + '" />');
			for (var j = 0; j < idx.length; j += 3) { if (idx[j] === idx[j + 1] || idx[j + 1] === idx[j + 2] || idx[j] === idx[j + 2]) continue; ts.push('<triangle v1="' + idx[j] + '" v2="' + idx[j + 1] + '" v3="' + idx[j + 2] + '" />'); }
			out.push('  <object id="' + id + '" name="' + xmlEsc(o.name || ('Part ' + (k + 1))) + '" type="model" pid="1" pindex="' + matIndex[hex6(o.color)] + '">',
				'   <mesh><vertices>' + vs.join('') + '</vertices><triangles>' + ts.join('') + '</triangles></mesh>', '  </object>');
		});
		out.push(' </resources>', ' <build>' + ids.map(function (id) { return '<item objectid="' + id + '" />'; }).join('') + '</build>', '</model>');
		return out.join('\n');
	}
	var THREEMF_TYPES = '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" /></Types>';
	var THREEMF_RELS = '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" /></Relationships>';

	// ---------- base64 for Float32Array (project files) ----------
	var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
	function bytesToB64(u8) {
		var out = [], i = 0;
		for (; i + 2 < u8.length; i += 3) { var n = u8[i] << 16 | u8[i + 1] << 8 | u8[i + 2]; out.push(B64[n >> 18 & 63] + B64[n >> 12 & 63] + B64[n >> 6 & 63] + B64[n & 63]); }
		if (i < u8.length) { var m = u8[i] << 16 | (i + 1 < u8.length ? u8[i + 1] << 8 : 0); out.push(B64[m >> 18 & 63] + B64[m >> 12 & 63] + (i + 1 < u8.length ? B64[m >> 6 & 63] : '=') + '='); }
		return out.join('');
	}
	function b64ToBytes(s) {
		var str = String(s).replace(/[^A-Za-z0-9+/]/g, ''), len = Math.floor(str.length * 3 / 4), out = new Uint8Array(len), j = 0, lut = {};
		for (var k = 0; k < 64; k++) lut[B64[k]] = k;
		for (var i = 0; i < str.length; i += 4) {
			var a = lut[str[i]], b = lut[str[i + 1]], c = lut[str[i + 2]], d = lut[str[i + 3]];
			var n = a << 18 | b << 12 | (c || 0) << 6 | (d || 0);
			if (j < len) out[j++] = n >> 16 & 255;
			if (c !== undefined && j < len) out[j++] = n >> 8 & 255;
			if (d !== undefined && j < len) out[j++] = n & 255;
		}
		return out;
	}
	function f32ToB64(f) { return bytesToB64(new Uint8Array(f.buffer, f.byteOffset, f.byteLength)); }
	function b64ToF32(s) { var b = b64ToBytes(s); var n = Math.floor(b.length / 4), copy = new Uint8Array(n * 4); copy.set(b.subarray(0, n * 4)); return new Float32Array(copy.buffer); }

	// ---------- arranging ----------
	// align boxes [{min, max}] on axis k (0 x, 1 y, 2 z) to 'min' | 'mid' | 'max' of their combined box; returns the shift for each
	function alignShifts(boxes, k, how) {
		var lo = Infinity, hi = -Infinity;
		boxes.forEach(function (b) { lo = Math.min(lo, b.min[k]); hi = Math.max(hi, b.max[k]); });
		return boxes.map(function (b) {
			if (how === 'min') return lo - b.min[k];
			if (how === 'max') return hi - b.max[k];
			return (lo + hi) / 2 - (b.min[k] + b.max[k]) / 2;
		});
	}
	// spread the centres evenly between the first and last (sorted along the axis); returns shifts in the original order
	function distributeShifts(boxes, k) {
		var c = boxes.map(function (b, i) { return { i: i, c: (b.min[k] + b.max[k]) / 2 }; }).sort(function (a, b) { return a.c - b.c; });
		var out = boxes.map(function () { return 0; });
		if (c.length < 3) return out;
		var a = c[0].c, b = c[c.length - 1].c;
		c.forEach(function (e, j) { out[e.i] = a + (b - a) * j / (c.length - 1) - e.c; });
		return out;
	}

	// ---------- project files ----------
	var TYPES = ['box', 'plate', 'sphere', 'cylinder', 'cone', 'pyramid', 'wedge', 'torus', 'tube', 'star', 'heart', 'polygon', 'gear', 'text', 'lathe', 'extrude', 'mesh', 'group'];
	function validObj(o, depth) {
		if (!o || typeof o !== 'object' || (depth || 0) > 24) return false;
		if (TYPES.indexOf(o.type) < 0) return false;
		var v3 = function (a) { return Array.isArray(a) && a.length === 3 && a.every(function (x) { return typeof x === 'number' && isFinite(x); }); };
		if (!v3(o.pos) || !v3(o.rot) || !v3(o.scl)) return false;
		if (o.type === 'group') return Array.isArray(o.children) && o.children.length > 0 && o.children.every(function (c) { return validObj(c, (depth || 0) + 1); });
		return true;
	}
	function validProject(p) { return !!(p && p.app === 'mes-3d-studio' && Array.isArray(p.objs) && p.objs.every(function (o) { return validObj(o, 0); })); }
	function safeName(s, fallback) { var n = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80); return n || fallback || 'model'; }


	// ---------- picture -> 3D relief (heights on a grid of cells, used by "Photo to 3D") ----------
	// Box-filter / bilinear resample of a w x h float grid to nw x nh.
	function resampleGrid(a, w, h, nw, nh) {
		var o = new Float32Array(nw * nh), sx = w / nw, sy = h / nh;
		for (var j = 0; j < nh; j++) for (var i = 0; i < nw; i++) {
			if (sx > 1 || sy > 1) { // shrink: average the source pixels under the cell
				var x0 = Math.floor(i * sx), x1 = Math.max(x0 + 1, Math.floor((i + 1) * sx)), y0 = Math.floor(j * sy), y1 = Math.max(y0 + 1, Math.floor((j + 1) * sy)), t = 0, c = 0;
				for (var y = y0; y < y1 && y < h; y++) for (var x = x0; x < x1 && x < w; x++) { t += a[y * w + x]; c++; }
				o[j * nw + i] = c ? t / c : 0;
			} else { // grow: bilinear
				var fx = Math.min(w - 1, Math.max(0, (i + 0.5) * sx - 0.5)), fy = Math.min(h - 1, Math.max(0, (j + 0.5) * sy - 0.5)), ix = Math.floor(fx), iy = Math.floor(fy), ax = fx - ix, ay = fy - iy, ix2 = Math.min(w - 1, ix + 1), iy2 = Math.min(h - 1, iy + 1);
				o[j * nw + i] = (a[iy * w + ix] * (1 - ax) + a[iy * w + ix2] * ax) * (1 - ay) + (a[iy2 * w + ix] * (1 - ax) + a[iy2 * w + ix2] * ax) * ay;
			}
		}
		return o;
	}
	// Outline of the model: 'rect', 'circle' (largest circle in the middle), 'oval' (fills the picture) or 'subject' (alpha >= 0.5).
	function shapeMask(kind, w, h, alpha) {
		var m = new Uint8Array(w * h), cx = w / 2, cy = h / 2, r = Math.min(w, h) / 2;
		for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
			var k = j * w + i, dx = i + 0.5 - cx, dy = j + 0.5 - cy;
			m[k] = kind === 'circle' ? (dx * dx + dy * dy <= r * r ? 1 : 0) : kind === 'oval' ? ((dx * dx) / (cx * cx) + (dy * dy) / (cy * cy) <= 1 ? 1 : 0) : kind === 'subject' ? (alpha && alpha[k] >= 0.5 ? 1 : 0) : 1;
		}
		return m;
	}
	function components(m, w, h, val) { // 4-connected pieces of cells equal to val -> {lab Int32Array, sizes[], touches[] (touches the grid edge)}
		var lab = new Int32Array(w * h).fill(-1), sizes = [], touches = [], st = new Int32Array(w * h);
		for (var s0 = 0; s0 < w * h; s0++) {
			if (m[s0] !== val || lab[s0] >= 0) continue;
			var id = sizes.length, n = 0, top = 0, edge = false; st[top++] = s0; lab[s0] = id;
			while (top) {
				var k = st[--top], x = k % w, y = (k - x) / w; n++;
				if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
				if (x > 0 && m[k - 1] === val && lab[k - 1] < 0) { lab[k - 1] = id; st[top++] = k - 1; }
				if (x < w - 1 && m[k + 1] === val && lab[k + 1] < 0) { lab[k + 1] = id; st[top++] = k + 1; }
				if (y > 0 && m[k - w] === val && lab[k - w] < 0) { lab[k - w] = id; st[top++] = k - w; }
				if (y < h - 1 && m[k + w] === val && lab[k + w] < 0) { lab[k + w] = id; st[top++] = k + w; }
			}
			sizes.push(n); touches.push(edge);
		}
		return { lab: lab, sizes: sizes, touches: touches };
	}
	// Makes a mask printable as one watertight solid: cells that only touch at a corner get joined (else edges would be shared by 4 faces),
	// optionally only the biggest piece is kept and holes smaller than opt.holes cells are filled. Returns a new Uint8Array.
	function cleanMask(mask, w, h, opt) {
		opt = opt || {}; var m = new Uint8Array(mask), i, k;
		if (opt.largest !== false) {
			var c = components(m, w, h, 1), best = -1, bn = 0;
			for (i = 0; i < c.sizes.length; i++) if (c.sizes[i] > bn) { bn = c.sizes[i]; best = i; }
			for (k = 0; k < m.length; k++) if (m[k] && c.lab[k] !== best) m[k] = 0;
		}
		if (opt.holes > 0) {
			var e = components(m, w, h, 0);
			for (k = 0; k < m.length; k++) if (!m[k] && !e.touches[e.lab[k]] && e.sizes[e.lab[k]] <= opt.holes) m[k] = 1;
		}
		for (var pass = 0; pass < 8; pass++) { // join corner-only contacts
			var changed = false;
			for (var y = 0; y < h - 1; y++) for (var x = 0; x < w - 1; x++) {
				var a = m[y * w + x], b = m[y * w + x + 1], cc = m[(y + 1) * w + x], d = m[(y + 1) * w + x + 1];
				if (a && d && !b && !cc) { m[y * w + x + 1] = 1; changed = true; }
				else if (b && cc && !a && !d) { m[y * w + x] = 1; changed = true; }
			}
			if (!changed) break;
		}
		return m;
	}
	function boxBlur(v, mask, w, h, passes) { // blur that only mixes cells inside the mask
		var a = new Float32Array(v), b = new Float32Array(v.length);
		for (var p = 0; p < passes; p++) {
			for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
				var k = y * w + x; if (mask && !mask[k]) { b[k] = a[k]; continue; }
				var t = 0, c = 0;
				for (var dy = -1; dy <= 1; dy++) { var yy = y + dy; if (yy < 0 || yy >= h) continue; for (var dx = -1; dx <= 1; dx++) { var xx = x + dx; if (xx < 0 || xx >= w) continue; var q = yy * w + xx; if (mask && !mask[q]) continue; t += a[q]; c++; } }
				b[k] = t / c;
			}
			var tmp = a; a = b; b = tmp;
		}
		return a;
	}
	// Raw values (depth or brightness) -> heights 0..1 inside the mask: percentile stretch (lo..hi %), smoothing, gamma, invert.
	function normHeights(v, mask, w, h, opt) {
		opt = opt || {}; var vals = [], k, n = w * h;
		var s = opt.blur > 0 ? boxBlur(v, mask, w, h, opt.blur | 0) : v;
		for (k = 0; k < n; k++) if (!mask || mask[k]) vals.push(s[k]);
		if (!vals.length) return new Float32Array(n);
		vals.sort(function (a, b) { return a - b; });
		var lo = vals[Math.floor((vals.length - 1) * (opt.lo == null ? 0.02 : opt.lo))], hi = vals[Math.floor((vals.length - 1) * (opt.hi == null ? 0.98 : opt.hi))], rg = hi - lo || 1, g = opt.gamma > 0 ? opt.gamma : 1, o = new Float32Array(n);
		for (k = 0; k < n; k++) { var t = Math.min(1, Math.max(0, (s[k] - lo) / rg)); if (opt.invert) t = 1 - t; o[k] = g === 1 ? t : Math.pow(t, g); }
		return o;
	}
	// Distance (in cells, 8-neighbour chamfer) from each inside cell to the nearest outside cell or the grid edge.
	function edgeDistance(mask, w, h) {
		var d = new Float32Array(w * h), INF = 1e9, x, y, k, D = Math.SQRT2;
		for (k = 0; k < d.length; k++) d[k] = mask[k] ? INF : 0;
		function g(xx, yy) { return xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : d[yy * w + xx]; }
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) { k = y * w + x; if (!d[k]) continue; d[k] = Math.min(d[k], g(x - 1, y) + 1, g(x, y - 1) + 1, g(x - 1, y - 1) + D, g(x + 1, y - 1) + D); }
		for (y = h - 1; y >= 0; y--) for (x = w - 1; x >= 0; x--) { k = y * w + x; if (!d[k]) continue; d[k] = Math.min(d[k], g(x + 1, y) + 1, g(x, y + 1) + 1, g(x + 1, y + 1) + D, g(x - 1, y + 1) + D); }
		return d;
	}
	// Heights (0..1, row 0 = top of the picture) + mask -> closed, outward-facing triangle soup in mm, Z up, the picture lying on the plate.
	// opt: cell (mm per cell), base (mm under the lowest point), height (mm of relief), twoSided (mirror the relief under the model, flat-back otherwise),
	// border (mm of frame at full height round the edge), smoothEdge (taper the relief to 0 over this many mm near the outline).
	function reliefMesh(H, mask, w, h, opt) {
		opt = opt || {}; var cell = opt.cell || 0.5, base = opt.base == null ? 1 : opt.base, hh = opt.height == null ? 3 : opt.height, two = !!opt.twoSided, x, y, k;
		var bc = (opt.border || 0) / cell, tc = (opt.smoothEdge || 0) / cell, dist = bc > 0 || tc > 0 ? edgeDistance(mask, w, h) : null;
		var val = new Float32Array(w * h);
		for (k = 0; k < w * h; k++) { if (!mask[k]) continue; var t = H[k]; if (dist) { if (dist[k] <= bc) t = 1; else if (tc > 0 && dist[k] - bc < tc) t *= (dist[k] - bc) / tc; } val[k] = t; }
		// corner heights = average of the inside cells around the corner (corners on a (w+1) x (h+1) grid)
		var W1 = w + 1, ct = new Float32Array(W1 * (h + 1)), cn = new Uint8Array(W1 * (h + 1));
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) { k = y * w + x; if (!mask[k]) continue; var v = val[k]; [y * W1 + x, y * W1 + x + 1, (y + 1) * W1 + x, (y + 1) * W1 + x + 1].forEach(function (c) { ct[c] += v; cn[c]++; }); }
		for (k = 0; k < ct.length; k++) if (cn[k]) ct[k] /= cn[k];
		var cells = 0, walls = 0;
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) { k = y * w + x; if (!mask[k]) continue; cells++; if (x === 0 || !mask[k - 1]) walls++; if (x === w - 1 || !mask[k + 1]) walls++; if (y === 0 || !mask[k - w]) walls++; if (y === h - 1 || !mask[k + w]) walls++; }
		var out = new Float32Array((cells * 4 + walls * 2) * 9), p = 0;
		function zt(c) { return two ? base / 2 + ct[c] * hh : base + ct[c] * hh; }
		function zb(c) { return two ? -(base / 2 + ct[c] * hh) : 0; }
		function px(cx) { return cx * cell; }
		function py(cy) { return (h - cy) * cell; } // picture row -> y up
		function tri(a, b, c) { out[p++] = a[0]; out[p++] = a[1]; out[p++] = a[2]; out[p++] = b[0]; out[p++] = b[1]; out[p++] = b[2]; out[p++] = c[0]; out[p++] = c[1]; out[p++] = c[2]; }
		function quad(a, b, c, d) { tri(a, b, c); tri(a, c, d); }
		for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
			k = y * w + x; if (!mask[k]) continue;
			// corners in picture coords: TL (x,y) TR (x+1,y) BL (x,y+1) BR (x+1,y+1); in the mesh y grows upward, so BL is "south-west"
			var cTL = y * W1 + x, cTR = cTL + 1, cBL = cTL + W1, cBR = cBL + 1;
			var T = function (c, cx, cy) { return [px(cx), py(cy), zt(c)]; }, B = function (c, cx, cy) { return [px(cx), py(cy), zb(c)]; };
			var tBL = T(cBL, x, y + 1), tBR = T(cBR, x + 1, y + 1), tTR = T(cTR, x + 1, y), tTL = T(cTL, x, y);
			var bBL = B(cBL, x, y + 1), bBR = B(cBR, x + 1, y + 1), bTR = B(cTR, x + 1, y), bTL = B(cTL, x, y);
			quad(tBL, tBR, tTR, tTL); // top, counter-clockwise from above
			quad(bBL, bTL, bTR, bBR); // bottom, facing down
			if (y === h - 1 || !mask[k + w]) quad(bBL, bBR, tBR, tBL); // south wall (-y)
			if (y === 0 || !mask[k - w]) quad(bTR, bTL, tTL, tTR); // north wall (+y)
			if (x === w - 1 || !mask[k + 1]) quad(bBR, bTR, tTR, tBR); // east wall (+x)
			if (x === 0 || !mask[k - 1]) quad(bTL, bBL, tBL, tTL); // west wall (-x)
		}
		return out;
	}
	// Grid size for a picture: at most maxCells cells, keeping the aspect ratio.
	function reliefGrid(w, h, maxCells) { var s = Math.min(1, Math.sqrt((maxCells || 60000) / (w * h))); return { w: Math.max(2, Math.round(w * s)), h: Math.max(2, Math.round(h * s)) }; }
	function luminance(rgba, n) { var o = new Float32Array(n); for (var i = 0; i < n; i++) o[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255; return o; }
	var RELIEF_PRESETS = {
		relief: { name: 'Raised picture (relief)', source: 'depth', shape: 'rect', width: 100, base: 2, height: 6, border: 0, two: false, blur: 2, gamma: 1, invert: false },
		medal: { name: 'Coin / medallion', source: 'depth', shape: 'circle', width: 60, base: 2, height: 3, border: 2.5, two: false, blur: 2, gamma: 1, invert: false },
		figure: { name: 'Cut-out figure (flat back)', source: 'depth', shape: 'subject', width: 80, base: 2, height: 10, border: 0, two: false, blur: 3, gamma: 1, invert: false },
		puffy: { name: 'Cut-out figure (both sides)', source: 'depth', shape: 'subject', width: 80, base: 3, height: 7, border: 0, two: true, blur: 3, gamma: 1, invert: false },
		litho: { name: 'Lithophane (light shines through)', source: 'dark', shape: 'rect', width: 100, base: 0.8, height: 2.2, border: 3, two: false, blur: 0, gamma: 1, invert: false },
		logo: { name: 'Logo or drawing (brightness)', source: 'dark', shape: 'rect', width: 80, base: 2, height: 2, border: 0, two: false, blur: 0, gamma: 1, invert: false }
	};

	var api = { PLATES: PLATES, plateById: plateById, MATERIALS: MATERIALS, materialById: materialById, UNITS: UNITS, parseLength: parseLength, fmtLength: fmtLength, fmtNum: fmtNum, snap: snap,
		bboxOf: bboxOf, volumeArea: volumeArea, flipWinding: flipWinding, weld: weld, manifoldCheck: manifoldCheck, overhang: overhang, plateFit: plateFit, filament: filament,
		polyArea: polyArea, ccw: ccw, circlePts: circlePts, roundedRect: roundedRect, starPts: starPts, heartPts: heartPts, polygonPts: polygonPts, gearPts: gearPts, bounds2: bounds2, offsetPolygon: offsetPolygon, cleanProfile: cleanProfile,
		threeMFModel: threeMFModel, THREEMF_TYPES: THREEMF_TYPES, THREEMF_RELS: THREEMF_RELS, hex6: hex6,
		bytesToB64: bytesToB64, b64ToBytes: b64ToBytes, f32ToB64: f32ToB64, b64ToF32: b64ToF32,
		alignShifts: alignShifts, resampleGrid: resampleGrid, shapeMask: shapeMask, cleanMask: cleanMask, normHeights: normHeights, edgeDistance: edgeDistance, reliefMesh: reliefMesh, reliefGrid: reliefGrid, luminance: luminance, RELIEF_PRESETS: RELIEF_PRESETS, distributeShifts: distributeShifts, TYPES: TYPES, validObj: validObj, validProject: validProject, safeName: safeName };
	if (typeof module !== 'undefined' && module.exports) module.exports = api;
	root.MES3D = api;
})(typeof window !== 'undefined' ? window : this);
