/* MES Brick Builder engine (window.MESBrick). Pure (no DOM, no three.js): runs in node too.
 * Grid units: x and z in studs (8 mm), y in plates (3.2 mm; a brick is 3 plates). A part is
 * {u: id, t: type id, x, y, z (corner of its rotated footprint, bottom layer), r: 0-3 quarter turns, c: colour index}.
 * Strength model (simplified, said on the page): loads flow down from part to part; a joint whose carried centre of
 * mass lies outside its contact area must hold the moment with stud grip (clutch, N per stud times lever);
 * a part spanning a gap bends like a beam (ABS, hollow factor). */
(function (root) {
	'use strict';
	var STUD = 8, PLATE = 3.2, G = 9.81;
	var GRAM_PER_VOXEL = 0.1;          // a 2x4 brick (24 stud-plates) weighs about 2.3 g
	var CLUTCH = { normal: 1.5, strong: 3, none: 0 };   // N per stud (measured stud grip is roughly 1 to 3 N)
	var ABS_MPA = 40, E_ABS = 2300, HOLLOW = 0.6, MAXY = 900;   // a span may sag L/40 before the studs pop off

	var COLORS = [
		['Red', '#c91a09'], ['Blue', '#0055bf'], ['Yellow', '#f2cd37'], ['Green', '#237841'], ['White', '#f4f4f4'],
		['Black', '#1f2a33'], ['Light grey', '#a0a5a9'], ['Dark grey', '#6c6e68'], ['Orange', '#fe8a18'], ['Brown', '#6b4428'],
		['Tan', '#e4cd9e'], ['Lime', '#a5ca18'], ['Sky blue', '#4fa3e0'], ['Dark blue', '#163a6b'], ['Dark green', '#184632'],
		['Dark red', '#7a1515'], ['Pink', '#f49ab5'], ['Purple', '#7b3fa0'], ['Teal', '#1a9a8e'], ['Sand', '#c8b48a'],
		['Glass', '#cfe8f7'], ['Gold', '#c9a227']];
	var GLASS = 20;

	var PARTS = [], BY = {};
	function add(id, name, cat, w, d, h, o) {
		var p = { id: id, name: name, cat: cat, w: w, d: d, h: h, shape: (o && o.shape) || 'box', studs: !(o && o.nostuds) };
		for (var k in o || {}) if (k !== 'shape' && k !== 'nostuds') p[k] = o[k];
		p.vox = voxels(p); p.studCells = studCells(p); p.mass = +(p.vox.length * GRAM_PER_VOXEL * (p.massK || 1)).toFixed(2);
		PARTS.push(p); BY[id] = p; return p;
	}
	// arch underside: half-ellipse over the middle cells, legs one stud wide at each end
	function archUnder(p, i) {
		var a = (p.w - 2) / 2, b = p.h - 1, dx = Math.abs(i + 0.5 - p.w / 2);
		if (i === 0 || i === p.w - 1) return 0;
		var e = Math.max(0, dx - 0.5);       // the cell edge nearest a leg is where the opening is lowest
		return b * Math.sqrt(Math.max(0, 1 - (e / a) * (e / a)));
	}
	function voxels(p) {
		var v = [], i, j, l;
		for (i = 0; i < p.w; i++) for (j = 0; j < p.d; j++) {
			var lo = 0, hi = p.h - 1;
			if (p.shape === 'arch') lo = Math.min(p.h - 1, Math.floor(archUnder(p, i) + 1e-9));
			if (p.shape === 'inv' && j > 0) lo = p.h - 1;
			for (l = lo; l <= hi; l++) v.push([i, j, l]);
		}
		return v;
	}
	function studCells(p) {
		var s = [], i, j;
		if (!p.studs) return s;
		for (i = 0; i < p.w; i++) for (j = 0; j < p.d; j++) {
			if (p.shape === 'slope' && j > 0) continue;
			s.push([i, j]);
		}
		return s;
	}
	[[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [2, 2], [2, 3], [2, 4], [2, 6], [2, 8], [2, 10]].forEach(function (s) { add('b' + s[0] + 'x' + s[1], 'Brick ' + s[0] + 'x' + s[1], 'brick', s[1], s[0], 3); });
	[[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [1, 12], [1, 16], [2, 2], [2, 3], [2, 4], [2, 6], [2, 8], [2, 12], [2, 16], [4, 4], [4, 6], [4, 8], [4, 12], [6, 6], [6, 10], [8, 8], [8, 16]].forEach(function (s) { add('p' + s[0] + 'x' + s[1], 'Plate ' + s[0] + 'x' + s[1], 'plate', s[1], s[0], 1); });
	[[1, 1], [1, 2], [1, 4], [1, 6], [2, 2], [2, 4], [4, 4]].forEach(function (s) { add('t' + s[0] + 'x' + s[1], 'Smooth tile ' + s[0] + 'x' + s[1], 'tile', s[1], s[0], 1, { nostuds: true }); });
	add('s1x2', 'Slope 1x2', 'slope', 1, 2, 3, { shape: 'slope' });
	add('s2x2', 'Slope 2x2', 'slope', 2, 2, 3, { shape: 'slope' });
	add('s4x2', 'Slope 2x4', 'slope', 4, 2, 3, { shape: 'slope' });
	add('i1x2', 'Inverted slope 1x2', 'slope', 1, 2, 3, { shape: 'inv' });
	add('i2x2', 'Inverted slope 2x2', 'slope', 2, 2, 3, { shape: 'inv' });
	add('r1x1', 'Round brick 1x1', 'round', 1, 1, 3, { shape: 'round', massK: 0.8 });
	add('r2x2', 'Round brick 2x2', 'round', 2, 2, 3, { shape: 'round', massK: 0.8 });
	add('rp1x1', 'Round plate 1x1', 'round', 1, 1, 1, { shape: 'round', massK: 0.8 });
	add('cone', 'Cone 1x1', 'round', 1, 1, 3, { shape: 'cone', massK: 0.5 });
	add('a1x4', 'Arch 1x4', 'arch', 4, 1, 3, { shape: 'arch' });
	add('a1x6', 'Arch 1x6 (tall)', 'arch', 6, 1, 6, { shape: 'arch' });
	add('a1x8', 'Arch 1x8 (tall)', 'arch', 8, 1, 6, { shape: 'arch' });
	add('a1x12', 'Arch 1x12 (bridge)', 'arch', 12, 1, 9, { shape: 'arch' });
	add('wheel', 'Wheel', 'wheel', 1, 2, 5, { shape: 'wheel', nostuds: true, massK: 0.4 });
	add('bigwheel', 'Big wheel', 'wheel', 2, 3, 9, { shape: 'wheel', nostuds: true, massK: 0.3 });
	var CATS = [['brick', 'Bricks'], ['plate', 'Plates'], ['tile', 'Tiles'], ['slope', 'Slopes'], ['round', 'Round'], ['arch', 'Arches'], ['wheel', 'Wheels']];

	// ---------- footprint maths ----------
	function size(def, r) { return (r & 1) ? [def.d, def.w] : [def.w, def.d]; }
	// local cell (i, j) of a part turned r quarter turns -> offset in its rotated footprint (matches a three.js rotation.y of -r*90deg)
	function rot(def, r, i, j) {
		switch (r & 3) {
			case 1: return [def.d - 1 - j, i];
			case 2: return [def.w - 1 - i, def.d - 1 - j];
			case 3: return [j, def.w - 1 - i];
			default: return [i, j];
		}
	}
	function cellsOf(p) {
		var def = BY[p.t], out = [];
		def.vox.forEach(function (v) { var o = rot(def, p.r, v[0], v[1]); out.push([p.x + o[0], p.y + v[2], p.z + o[1]]); });
		return out;
	}
	function key(x, y, z) { return (y * 512 + x) * 512 + z; }

	// ---------- the world ----------
	function World(sz) { this.size = sz || 32; this.parts = []; this.byU = {}; this.grid = new Map(); this.next = 1; }
	World.prototype.at = function (x, y, z) { return this.grid.get(key(x, y, z)) || 0; };
	World.prototype.inside = function (x, y, z) { return x >= 0 && z >= 0 && x < this.size && z < this.size && y >= 0 && y < MAXY; };
	World.prototype.fits = function (p) {
		var self = this;
		return cellsOf(p).every(function (c) { var o = self.at(c[0], c[1], c[2]); return self.inside(c[0], c[1], c[2]) && (!o || o === p.u); });
	};
	World.prototype.supported = function (p) {
		var self = this;
		return cellsOf(p).some(function (c) {
			if (c[1] === 0) return true;
			var b = self.at(c[0], c[1] - 1, c[2]), a = self.at(c[0], c[1] + 1, c[2]);
			return (b && b !== p.u) || (a && a !== p.u);
		});
	};
	// lowest height where the part rests on whatever is highest under its footprint (dropped from above)
	World.prototype.dropY = function (t, r, x, z) {
		var def = BY[t], low = {}, y = 0, self = this;
		def.vox.forEach(function (v) { var o = rot(def, r, v[0], v[1]), k = o[0] + ',' + o[1]; if (low[k] === undefined || v[2] < low[k]) low[k] = v[2]; });
		Object.keys(low).forEach(function (k) {
			var s = k.split(','), cx = x + +s[0], cz = z + +s[1], top = self.colTop(cx, cz);
			y = Math.max(y, top - low[k]);
		});
		return y;
	};
	World.prototype.colTop = function (x, z) {
		var t = this._tops && this._tops.get(x * 512 + z);
		return t || 0;
	};
	World.prototype._retop = function () {
		var m = new Map();
		this.grid.forEach(function (u, k) { var y = Math.floor(k / 262144), rest = k - y * 262144, x = Math.floor(rest / 512), z = rest - x * 512, kk = x * 512 + z; if ((m.get(kk) || 0) < y + 1) m.set(kk, y + 1); });
		this._tops = m;
	};
	World.prototype.add = function (p, keepU) {
		var q = { u: keepU && p.u ? p.u : this.next++, t: p.t, x: p.x, y: p.y, z: p.z, r: p.r & 3, c: p.c | 0 };
		if (q.u >= this.next) this.next = q.u + 1;
		var self = this;
		cellsOf(q).forEach(function (c) { self.grid.set(key(c[0], c[1], c[2]), q.u); });
		this.parts.push(q); this.byU[q.u] = q; this._retop(); return q;
	};
	World.prototype.remove = function (u) {
		var p = this.byU[u], self = this; if (!p) return null;
		cellsOf(p).forEach(function (c) { var k = key(c[0], c[1], c[2]); if (self.grid.get(k) === u) self.grid.delete(k); });
		this.parts.splice(this.parts.indexOf(p), 1); delete this.byU[u]; this._retop(); return p;
	};
	World.prototype.clear = function () { this.parts = []; this.byU = {}; this.grid = new Map(); this._tops = new Map(); this.next = 1; };
	// place at a wanted height if it fits and connects, otherwise drop it from above
	World.prototype.placeY = function (t, r, x, z, want) {
		var p = { u: -1, t: t, r: r, x: x, z: z, y: want };
		if (want != null && want >= 0 && this.fits(p) && this.supported(p)) return want;
		return this.dropY(t, r, x, z);
	};
	World.prototype.load = function (list) { var self = this; this.clear(); (list || []).forEach(function (p) { if (BY[p.t]) self.add(p); }); };
	World.prototype.list = function () { return this.parts.map(function (p) { return { t: p.t, x: p.x, y: p.y, z: p.z, r: p.r, c: p.c }; }); };

	// ---------- connections ----------
	function studAt(p, x, z) {
		var def = BY[p.t];
		return def.studCells.some(function (s) { var o = rot(def, p.r, s[0], s[1]); return p.x + o[0] === x && p.z + o[1] === z; });
	}
	function contacts(w) {
		var below = {}, above = {}, ground = {};
		w.parts.forEach(function (p) { below[p.u] = new Map(); above[p.u] = new Map(); ground[p.u] = []; });
		w.parts.forEach(function (p) {
			cellsOf(p).forEach(function (c) {
				if (c[1] === 0) { ground[p.u].push([c[0], c[2]]); return; }
				var q = w.at(c[0], c[1] - 1, c[2]);
				if (q && q !== p.u) {
					var gq = studAt(w.byU[q], c[0], c[2]) || BY[w.byU[q].t].shape === 'wheel';   // wheels hang on axles           // smooth tiles and slope faces do not grip what sits on them
					if (!below[p.u].has(q)) below[p.u].set(q, []);
					below[p.u].get(q).push([c[0], c[2], gq]);
					if (!above[q].has(p.u)) above[q].set(p.u, []);
					above[q].get(p.u).push([c[0], c[2], gq]);
				}
			});
		});
		return { below: below, above: above, ground: ground };
	}
	function groups(w, C) {
		C = C || contacts(w);
		var seen = {}, list = [];
		w.parts.forEach(function (p) {
			if (seen[p.u]) return;
			var g = { parts: [], grounded: false }, st = [p.u]; seen[p.u] = 1;
			while (st.length) {
				var u = st.pop(); g.parts.push(u); if (C.ground[u].length) g.grounded = true;
				[C.below[u], C.above[u]].forEach(function (m) { m.forEach(function (_, q) { if (!seen[q]) { seen[q] = 1; st.push(q); } }); });
			}
			list.push(g);
		});
		return list;
	}

	// ---------- geometry helpers for the strength model ----------
	function hull(pts) {
		pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
		var uniq = []; pts.forEach(function (p) { var l = uniq[uniq.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) uniq.push(p); });
		pts = uniq; if (pts.length < 3) return pts;
		function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
		var lo = [], up = [], i;
		for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
		for (i = pts.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop(); up.push(pts[i]); }
		lo.pop(); up.pop(); return lo.concat(up);
	}
	function cellCorners(cells) { var c = []; cells.forEach(function (s) { c.push([s[0], s[1]], [s[0] + 1, s[1]], [s[0], s[1] + 1], [s[0] + 1, s[1] + 1]); }); return c; }
	// how far (studs) a point lies outside the contact area (<= 0 inside), and the edge it tips over
	function outside(cells, px, pz) {
		var h = hull(cellCorners(cells)), best = -Infinity, edge = null, n = h.length;
		for (var i = 0; i < n; i++) {
			var a = h[i], b = h[(i + 1) % n], ex = b[0] - a[0], ez = b[1] - a[1], L = Math.hypot(ex, ez);
			if (!L) continue;
			// counter-clockwise hull: outward normal is (ez, -ex)/L
			var d = ((px - a[0]) * ez - (pz - a[1]) * ex) / L;
			if (d > best) { best = d; edge = { a: a, nx: ez / L, nz: -ex / L }; }
		}
		return { d: best, edge: edge };
	}
	function centroid(cells) { var x = 0, z = 0; cells.forEach(function (c) { x += c[0] + 0.5; z += c[1] + 0.5; }); return [x / cells.length, z / cells.length]; }
	function uniqCells(cells) { var s = {}, out = []; cells.forEach(function (c) { var k = c[0] + ',' + c[1]; if (!s[k]) { s[k] = out.length + 1; out.push(c); } else if (c[2] !== false) out[s[k] - 1] = c; }); return out; }

	// ---------- strength ----------
	function analyze(w, o) {
		o = o || {};
		var clutch = o.clutch == null ? CLUTCH.normal : o.clutch, anchored = o.anchored !== false, loads = o.loads || {};
		var C = contacts(w), gs = groups(w, C), res = { stress: {}, why: {}, floating: [], groups: gs.length, tips: false, mass: 0, max: 0, weakest: 0, carried: {}, bendInfo: {} };
		var grounded = {};
		gs.forEach(function (g) { g.parts.forEach(function (u) { grounded[u] = g.grounded; if (!g.grounded) res.floating.push(u); }); });
		// which parts rest on something (directly or through parts below)
		var rest = {}, changed = true, P = w.parts;
		P.forEach(function (p) { rest[p.u] = C.ground[p.u].length > 0; });
		while (changed) { changed = false; P.forEach(function (p) { if (rest[p.u]) return; var r = false; C.below[p.u].forEach(function (_, q) { if (rest[q]) r = true; }); if (r) { rest[p.u] = true; changed = true; } }); }
		// distance from the resting parts for the ones hanging under others
		var dist = {}, q = [];
		P.forEach(function (p) { if (rest[p.u]) { dist[p.u] = 0; q.push(p.u); } });
		for (var qi = 0; qi < q.length; qi++) { var u0 = q[qi]; [C.below[u0], C.above[u0]].forEach(function (m) { m.forEach(function (_, v) { if (dist[v] === undefined) { dist[v] = dist[u0] + 1; q.push(v); } }); }); }
		var acc = {};
		P.forEach(function (p) {
			var def = BY[p.t], cc = centroid(cellsOf(p).map(function (c) { return [c[0], c[2]]; })), m = def.mass + (+loads[p.u] || 0);
			acc[p.u] = { m: m, mx: m * cc[0], mz: m * cc[1] };
			res.mass += def.mass + (+loads[p.u] || 0);
		});
		var groundAcc = { m: 0, mx: 0, mz: 0, cells: [] };
		function give(to, m, x, z) { var a = acc[to]; a.m += m; a.mx += m * x; a.mz += m * z; }
		function joint(u, cells, tension) {
			var a = acc[u], cx = a.mx / a.m, cz = a.mz / a.m, W = a.m / 1000 * G, out = outside(cells, cx, cz), s = 0, why = '';
			var grip = cells.filter(function (c) { return c[2] !== false; });
			if (tension) { s = clutch > 0 && grip.length ? W / (clutch * grip.length) : Infinity; why = 'hanging'; }
			if (out.d > 1e-9) {
				var lever = 0;
				grip.forEach(function (c) { var d = -(((c[0] + 0.5) - out.edge.a[0]) * out.edge.nx + ((c[1] + 0.5) - out.edge.a[1]) * out.edge.nz); if (d > 0) lever += d; });
				var mo = clutch > 0 && lever > 0 ? (W * out.d) / (clutch * lever) : Infinity;
				if (mo > s) { s = mo; why = 'overhang'; }
			}
			return { s: s, why: why, out: out.d, cx: cx, cz: cz };
		}
		function setS(u, s, why) { if (!(res.stress[u] >= s)) { res.stress[u] = s; res.why[u] = why; } }
		function bend(p, supCells) {
			var def = BY[p.t]; if (def.shape === 'arch' || def.shape === 'wheel') return;
			var sz = size(def, p.r), alongX = sz[0] >= sz[1], len = alongX ? sz[0] : sz[1]; if (len < 3) return;
			var pos = {}; supCells.forEach(function (c) { pos[alongX ? c[0] : c[1]] = 1; });
			var ks = Object.keys(pos).map(Number).sort(function (a, b) { return a - b; }); if (ks.length < 2) return;
			var gap = 0, gs0 = 0; for (var i = 1; i < ks.length; i++) { var gg = ks[i] - ks[i - 1] - 1; if (gg > gap) { gap = gg; gs0 = ks[i - 1]; } }
			if (gap < 1) return;
			// plates and bricks stacked on top over the gap bend together with this part (the studs lock them)
			var mid = gs0 + 1 + Math.floor(gap / 2), cross = alongX ? p.z + Math.floor(sz[1] / 2) : p.x + Math.floor(sz[0] / 2), top = p.y + def.h, hh = def.h;
			while (hh < 12 && w.at(alongX ? mid : cross, top, alongX ? cross : mid)) { hh++; top++; }
			var L = (gap + 1) * STUD, b = (alongX ? sz[1] : sz[0]) * STUD, h = hh * PLATE, S = b * h * h / 6 * HOLLOW, I = b * h * h * h / 12 * HOLLOW;
			var onTop = acc[p.u].m - def.mass, P0 = onTop / 1000 * G, q = def.mass / 1000 * G;
			var M = P0 * L / 4 + q * L / 8, defl = P0 * L * L * L / (48 * E_ABS * I) + 5 * q * L * L * L / (384 * E_ABS * I);
			var s1 = (M / S) / ABS_MPA, s2 = defl / (L / 40), s = Math.max(s1, s2);
			res.bendInfo[p.u] = { span: gap + 1, depth: hh, sag: defl };
			setS(p.u, s, 'bending');
		}
		// 1) parts hanging under others pass their weight up
		var hang = P.filter(function (p) { return !rest[p.u] && grounded[p.u]; }).sort(function (a, b) { return dist[b.u] - dist[a.u]; });
		hang.forEach(function (p) {
			var sup = []; C.above[p.u].forEach(function (cells, v) { if (dist[v] < dist[p.u]) sup.push([v, cells]); });
			if (!sup.length) return;
			var cells = []; sup.forEach(function (s) { cells = cells.concat(s[1]); });
			var j = joint(p.u, cells, true); setS(p.u, j.s, j.why);
			var a = acc[p.u], tot = 0; sup.forEach(function (s) { tot += s[1].length; });
			sup.forEach(function (s) { var cc = centroid(s[1]); give(s[0], a.m * s[1].length / tot, sup.length === 1 ? j.cx : cc[0], sup.length === 1 ? j.cz : cc[1]); });
		});
		// 2) resting parts, top to bottom (every part resting on p is done before p)
		var sups = {}, indeg = {};
		P.forEach(function (p) { indeg[p.u] = 0; });
		P.forEach(function (p) { if (!rest[p.u]) return; var s = []; C.below[p.u].forEach(function (cells, v) { if (rest[v]) s.push([v, cells]); }); sups[p.u] = s; s.forEach(function (x) { indeg[x[0]]++; }); });
		var order = [], qq = P.filter(function (p) { return rest[p.u] && !indeg[p.u]; }).map(function (p) { return p.u; }), done = {};
		while (qq.length || order.length < P.filter(function (p) { return rest[p.u]; }).length) {
			if (!qq.length) { var left = P.filter(function (p) { return rest[p.u] && !done[p.u]; }).sort(function (a, b) { return b.y - a.y; }); if (!left.length) break; qq.push(left[0].u); }
			var u = qq.shift(); if (done[u]) continue; done[u] = 1; order.push(u);
			(sups[u] || []).forEach(function (x) { if (--indeg[x[0]] === 0) qq.push(x[0]); });
		}
		order.forEach(function (u) {
			var p = w.byU[u], s = sups[u] || [], gc = C.ground[u], a = acc[u];
			res.carried[u] = a.m;
			var cells = []; s.forEach(function (x) { cells = cells.concat(x[1]); });
			if (gc.length) {
				if (!anchored) {
					groundAcc.m += a.m; groundAcc.mx += a.mx; groundAcc.mz += a.mz; groundAcc.cells = groundAcc.cells.concat(gc);
					bend(p, uniqCells(cells.concat(gc))); return;
				}
				cells = cells.concat(gc);
			}
			if (!cells.length) return;
			var all = uniqCells(cells), j = joint(u, all, false);
			setS(u, j.s, j.why);
			bend(p, all);
			if (gc.length) return;           // the baseplate takes the rest
			if (s.length === 1) { give(s[0][0], a.m, j.cx, j.cz); return; }
			var ws = s.map(function (x) { var cc = centroid(x[1]); return x[1].length / (Math.hypot(cc[0] - j.cx, cc[1] - j.cz) + 0.5); }), tw = ws.reduce(function (t, v) { return t + v; }, 0);
			s.forEach(function (x, i) { var cc = centroid(x[1]); give(x[0], a.m * ws[i] / tw, cc[0], cc[1]); });
		});
		if (!anchored && groundAcc.cells.length) {
			var o2 = outside(uniqCells(groundAcc.cells), groundAcc.mx / groundAcc.m, groundAcc.mz / groundAcc.m);
			if (o2.d > 1e-9) { res.tips = true; res.tipBy = o2.d; }
		}
		P.forEach(function (p) { var s = res.stress[p.u] || 0; if (s > res.max) { res.max = s; res.weakest = p.u; } });
		return res;
	}
	// smallest extra load (grams) on part u that makes something fail; Infinity if it holds 50 kg
	function breakLoad(w, u, o) {
		o = o || {};
		function fails(g) { var L = {}; for (var k in o.loads || {}) L[k] = o.loads[k]; L[u] = (+L[u] || 0) + g; var r = analyze(w, { clutch: o.clutch, anchored: o.anchored, loads: L }); return (r.max >= 1 || r.tips) ? r : null; }
		var f0 = fails(0); if (f0) return { g: 0, weakest: f0.weakest, why: f0.why[f0.weakest] };
		var lo = 0, hi = 50000, f = fails(hi); if (!f) return { g: Infinity };
		for (var i = 0; i < 26 && hi - lo > 1; i++) { var mid = (lo + hi) / 2, r = fails(mid); if (r) { hi = mid; f = r; } else lo = mid; }
		return { g: Math.round(hi), weakest: f.weakest, why: f.tips ? 'tips over' : f.why[f.weakest] };
	}


	// ---------- crash: which joints give way when a body is stopped suddenly ----------
	// o.dir = the grid axis the body moves along into the obstacle, e.g. [1,0,0]; o.load(u) = force (N) needed to stop part u;
	// o.cap = N a gripping stud holds sideways; o.root = [{u, push: true}] parts pressed on the obstacle (always hold)
	// or [{u, grip: n}] parts held by n studs (a wall on its baseplate). Loads go the cheapest way to the obstacle:
	// pushing on the part in front is free, a stud joint costs 1, so force runs through solid rows first.
	function crashSplit(w, o) {
		var C = contacts(w), d = o.dir, P = w.parts, cap = o.cap == null ? 1.5 : o.cap, joint = {}, behind = {};
		P.forEach(function (p) { joint[p.u] = []; behind[p.u] = {}; });
		P.forEach(function (p) {
			C.below[p.u].forEach(function (cells, q) { var g = cells.filter(function (c) { return c[2] !== false; }).length; joint[p.u].push([q, g]); joint[q].push([p.u, g]); });
			cellsOf(p).forEach(function (c) { var q = w.at(c[0] + d[0], c[1] + d[1], c[2] + d[2]); if (q && q !== p.u) behind[q][p.u] = 1; });
		});
		var rootOf = {}; (o.root || []).forEach(function (r) { rootOf[r.u] = r; });
		// 0-1 breadth-first search from the obstacle
		var dist = {}, par = {}, kind = {}, grip = {}, order = [], dq = [], done = {};
		(o.root || []).forEach(function (r) { var c = r.push ? 0 : 1; if (dist[r.u] === undefined || c < dist[r.u]) { dist[r.u] = c; par[r.u] = 0; kind[r.u] = r.push ? 'push' : 'joint'; grip[r.u] = r.grip || 0; } });
		Object.keys(dist).forEach(function (u) { u = +u; if (dist[u] === 0) dq.unshift(u); else dq.push(u); });
		while (dq.length) {
			var u = dq.shift(); if (done[u]) continue; done[u] = 1; order.push(u);
			var relax = function (v, c, k, g) { var nd = dist[u] + c; if (done[v] || (dist[v] !== undefined && dist[v] <= nd)) return; dist[v] = nd; par[v] = u; kind[v] = k; grip[v] = g; if (c) dq.push(v); else dq.unshift(v); };
			Object.keys(behind[u]).forEach(function (v) { relax(+v, 0, 'push', 0); });
			joint[u].forEach(function (j) { relax(j[0], 1, 'joint', j[1]); });
		}
		var total = {}, broken = {}, nb = 0, peak = 0;
		P.forEach(function (p) { total[p.u] = Math.max(0, +o.load(p.u) || 0); });
		var kids = {}; order.forEach(function (u) { if (par[u]) (kids[par[u]] = kids[par[u]] || []).push(u); });
		var cut = {};   // u -> its subtree came off
		function subtree(u) { var s = {}, st = [u]; while (st.length) { var x = st.pop(); s[x] = 1; (kids[x] || []).forEach(function (k) { if (!cut[k]) st.push(k); }); } return s; }
		function brk(a, b) { if (!broken[a + ':' + b]) { broken[a + ':' + b] = broken[b + ':' + a] = 1; nb++; } }
		for (var i = order.length - 1; i >= 0; i--) {
			var u2 = order[i], t = total[u2]; peak = Math.max(peak, t);
			if (kind[u2] === 'joint' && t > grip[u2] * cap) {
				// the piece may also be held by other joints: it comes off only if all of them together are too weak
				var S = subtree(u2), out = [], capSum = 0;
				Object.keys(S).forEach(function (x) { joint[x].forEach(function (j) { if (!S[j[0]] && !broken[x + ':' + j[0]]) { out.push([+x, j[0]]); capSum += j[1] * cap; } }); });
				var r0 = rootOf[u2]; if (r0 && !r0.push) capSum += (r0.grip || 0) * cap;
				if (t > capSum) { out.forEach(function (e) { brk(e[0], e[1]); }); if (par[u2] === 0) brk(u2, 0); cut[u2] = 1; continue; }
			}
			if (par[u2]) total[par[u2]] += t;
		}
		// pieces = parts still joined by unbroken stud joints
		var seen = {}, groups = [];
		P.forEach(function (p) {
			if (seen[p.u]) return;
			var g = { parts: [], held: false }, st = [p.u]; seen[p.u] = 1;
			while (st.length) {
				var x = st.pop(); g.parts.push(x);
				var r = rootOf[x]; if (r && (r.push || !broken[x + ':0'])) g.held = true;
				joint[x].forEach(function (j) { if (!seen[j[0]] && !broken[x + ':' + j[0]]) { seen[j[0]] = 1; st.push(j[0]); } });
			}
			groups.push(g);
		});
		return { groups: groups, broken: nb, peak: peak };
	}
	// turn a whole build a quarter turn (same direction as a part's r + 1), keeping it in positive coordinates
	function rotList(list) {
		var SZ = 0; list.forEach(function (p) { SZ = Math.max(SZ, p.z + size(BY[p.t], p.r)[1]); });
		return list.map(function (p) { var s = size(BY[p.t], p.r); return { t: p.t, x: SZ - (p.z + s[1]), y: p.y, z: p.x, r: (p.r + 1) & 3, c: p.c }; });
	}
	function normList(list) {
		var mx = 1e9, my = 1e9, mz = 1e9; list.forEach(function (p) { mx = Math.min(mx, p.x); my = Math.min(my, p.y); mz = Math.min(mz, p.z); });
		return list.map(function (p) { return { t: p.t, x: p.x - mx, y: p.y - my, z: p.z - mz, r: p.r, c: p.c }; });
	}

	// ---------- save codes ----------
	function encode(list) { return '1:' + list.map(function (p) { return [p.t, p.x, p.y, p.z, p.r, p.c].join(','); }).join(';'); }
	function decode(s) {
		s = String(s || '').trim(); var m = /^1:(.*)$/.exec(s); if (!m) return null;
		if (!m[1]) return [];
		var out = [];
		m[1].split(';').forEach(function (x) {
			var f = x.split(','); if (f.length !== 6 || !BY[f[0]]) return;
			var n = f.slice(1).map(Number); if (n.some(function (v) { return !isFinite(v) || v < 0 || v !== Math.floor(v); })) return;
			if (n[0] > 255 || n[2] > 255 || n[1] >= MAXY || n[3] > 3 || n[4] >= COLORS.length) return;
			out.push({ t: f[0], x: n[0], y: n[1], z: n[2], r: n[3], c: n[4] });
		});
		return out;
	}
	function bom(list) {
		var m = {}; list.forEach(function (p) { var k = p.t + '|' + p.c; m[k] = (m[k] || 0) + 1; });
		return Object.keys(m).map(function (k) { var s = k.split('|'); return { t: s[0], c: +s[1], n: m[k], name: BY[s[0]].name, color: COLORS[+s[1]][0] }; })
			.sort(function (a, b) { return PARTS.indexOf(BY[a.t]) - PARTS.indexOf(BY[b.t]) || a.c - b.c; });
	}
	function stats(w) {
		var top = 0, minx = 1e9, maxx = -1, minz = 1e9, maxz = -1, mass = 0;
		w.parts.forEach(function (p) {
			var def = BY[p.t], s = size(def, p.r); top = Math.max(top, p.y + def.h);
			minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x + s[0]); minz = Math.min(minz, p.z); maxz = Math.max(maxz, p.z + s[1]); mass += def.mass;
		});
		return { n: w.parts.length, heightMm: top * PLATE, wide: maxx > minx ? maxx - minx : 0, deep: maxz > minz ? maxz - minz : 0, mass: mass };
	}
	// building order for instructions: bottom first, keeping the original order inside a layer
	function sortSteps(list) { return list.map(function (p, i) { return [p, i]; }).sort(function (a, b) { return a[0].y - b[0].y || a[1] - b[1]; }).map(function (x) { return x[0]; }); }
	function fmtG(g) { return !isFinite(g) ? 'more than 50 kg' : g >= 1000 ? (g / 1000).toFixed(g >= 10000 ? 0 : 1) + ' kg' : Math.round(g) + ' g'; }

	var api = { STUD: STUD, PLATE: PLATE, CLUTCH: CLUTCH, COLORS: COLORS, GLASS: GLASS, PARTS: PARTS, BY: BY, CATS: CATS, MAXY: MAXY,
		size: size, rot: rot, studAt: studAt, cellsOf: cellsOf, World: World, contacts: contacts, groups: groups, hull: hull, outside: outside,
		analyze: analyze, breakLoad: breakLoad, crashSplit: crashSplit, rotList: rotList, normList: normList, encode: encode, decode: decode, bom: bom, stats: stats, sortSteps: sortSteps, fmtG: fmtG, archUnder: archUnder };
	if (typeof module === 'object' && module.exports) module.exports = api; else root.MESBrick = api;
})(typeof window !== 'undefined' ? window : this);

/* MES Brick Builder: example builds (window.BB_EXAMPLES). All original designs. Each make() drops parts in building
 * order (that order is also the step-by-step instructions). Colour indexes are MESBrick.COLORS. */
(function (root) {
	'use strict';
	var M = root.MESBrick || (typeof require === 'function' ? require('./lib.js') : null);
	var RED = 0, BLUE = 1, YEL = 2, GRN = 3, WHT = 4, BLK = 5, LG = 6, DG = 7, ORA = 8, BRN = 9, TAN = 10, LIME = 11, SKY = 12, DBL = 13, DGR = 14, DRD = 15, PNK = 16, PUR = 17, TEAL = 18, SAND = 19, GLS = 20, GLD = 21;

	function B(size) {
		var w = new M.World(size || 32), list = [], loads = [];
		var api = {
			w: w,
			put: function (t, x, z, r, c, y) { var yy = w.placeY(t, r || 0, x, z, y); list.push(w.add({ t: t, x: x, z: z, r: r || 0, c: c, y: yy })); return list.length - 1; },
			load: function (i, g) { loads.push([i, g]); },
			// a straight run of 1-wide bricks along x (axis 'x') or z, cells from a to b inclusive; odd rows start with a short brick
			run: function (axis, fixed, a, b, y, c, row) {
				var x = a, first = true;
				while (x <= b) {
					var left = b - x + 1, L = first && row % 2 && left >= 3 ? 2 : Math.min(4, left);
					first = false;
					if (axis === 'x') api.put('b1x' + L, x, fixed, 0, c, y); else api.put('b1x' + L, fixed, x, 1, c, y);
					x += L;
				}
			},
			// a ring of walls, running bond, corners interlocked; type(x, z, row) = 0 wall, 1 gap, 2 glass
			walls: function (x0, z0, W, D, rows, c, y0, type) {
				for (var row = 0; row < rows; row++) {
					var y = y0 + row * 3, odd = row % 2, segs = [];
					[z0, z0 + D - 1].forEach(function (z) { segs.push(['x', z, odd ? x0 + 1 : x0, odd ? x0 + W - 2 : x0 + W - 1]); });
					[x0, x0 + W - 1].forEach(function (x) { segs.push(['z', x, odd ? z0 : z0 + 1, odd ? z0 + D - 1 : z0 + D - 2]); });
					segs.forEach(function (s) {
						var a = s[2], cur = -1, st = a;
						for (var k = a; k <= s[3] + 1; k++) {
							var tp = k > s[3] ? -2 : (type ? type(s[0] === 'x' ? k : s[1], s[0] === 'x' ? s[1] : k, row) : 0);
							if (tp !== cur) {
								if (cur === 0 || cur === 2) api.run(s[0], s[1], st, k - 1, y, cur === 2 ? GLS : c, row);
								cur = tp; st = k;
							}
						}
					});
				}
			},
			done: function (o) { var r = { parts: list.map(function (p) { return { t: p.t, x: p.x, y: p.y, z: p.z, r: p.r, c: p.c }; }), loads: loads }; for (var k in o || {}) r[k] = o[k]; return r; }
		};
		return api;
	}

	var EX = [
		// ---------------- for kids ----------------
		{ id: 'house', cat: 'kids', name: 'Little house', emoji: '🏠', desc: 'Walls in a brick pattern, a door, glass windows and a sloped roof with a chimney.',
			make: function () {
				var b = B();
				b.put('p8x16', 8, 10, 0, GRN);
				b.walls(8, 10, 16, 8, 5, WHT, 1, function (x, z, row) {
					if (z === 10 && (x === 15 || x === 16) && row < 4) return 1;
					if ((z === 10 || z === 17) && (x === 10 || x === 11 || x === 20 || x === 21) && (row === 2 || row === 3)) return 2;
					return 0;
				});
				b.put('p8x16', 8, 10, 0, LG);
				for (var x = 8; x < 24; x += 4) { b.put('s4x2', x, 10, 2, RED); b.put('s4x2', x, 16, 0, RED); }
				for (x = 8; x < 24; x += 4) { b.put('b2x4', x, 12, 0, RED); b.put('b2x4', x, 14, 0, RED); }
				for (x = 8; x < 24; x += 4) { b.put('s4x2', x, 12, 2, RED); b.put('s4x2', x, 14, 0, RED); }
				for (var i = 0; i < 3; i++) b.put('b1x2', 19, 14, 0, DG);
				return b.done();
			} },
		{ id: 'car', cat: 'kids', name: 'Race car', emoji: '🏎️', desc: 'Four wheels, a low body, a glass cabin and a sloped nose.',
			make: function () {
				var b = B();
				b.put('wheel', 12, 14, 1, BLK); b.put('wheel', 18, 14, 1, BLK); b.put('wheel', 12, 17, 1, BLK); b.put('wheel', 18, 17, 1, BLK);
				b.put('p4x8', 12, 14, 0, RED);
				b.put('b2x4', 14, 15, 0, DG, 2);
				b.put('s4x2', 12, 14, 1, RED);
				b.put('b2x4', 14, 14, 1, GLS);
				b.put('b2x4', 16, 14, 1, RED);
				b.put('s4x2', 18, 14, 3, RED);
				b.put('p2x4', 14, 14, 1, BLK);
				b.put('t1x1', 17, 14, 0, YEL); b.put('t1x1', 17, 17, 0, YEL);
				return b.done();
			} },
		{ id: 'tree', cat: 'kids', name: 'Tree', emoji: '🌳', desc: 'A round trunk and leaves that get smaller towards the top.',
			make: function () {
				var b = B();
				for (var i = 0; i < 4; i++) b.put('r2x2', 15, 15, 0, BRN);
				b.put('p6x6', 13, 13, 0, GRN);
				b.put('b2x6', 13, 13, 0, GRN); b.put('b2x6', 13, 15, 0, DGR); b.put('b2x6', 13, 17, 0, GRN);
				b.put('b2x4', 14, 14, 1, LIME); b.put('b2x4', 16, 14, 1, GRN);
				b.put('b2x2', 15, 15, 0, DGR);
				b.put('cone', 15, 15, 0, GRN); b.put('cone', 16, 16, 0, GRN);
				b.put('rp1x1', 13, 13, 0, RED); b.put('rp1x1', 18, 17, 0, RED); b.put('rp1x1', 14, 18, 0, RED);
				return b.done();
			} },
		{ id: 'rocket', cat: 'kids', name: 'Rocket', emoji: '🚀', desc: 'A tall round body with four fins and a red nose.',
			make: function () {
				var b = B();
				b.put('s1x2', 13, 15, 1, RED); b.put('s1x2', 17, 16, 3, RED); b.put('s1x2', 16, 13, 2, RED); b.put('s1x2', 15, 17, 0, RED);
				for (var i = 0; i < 7; i++) b.put('r2x2', 15, 15, 0, i === 3 ? BLUE : WHT);
				b.put('r2x2', 15, 15, 0, RED);
				b.put('cone', 15, 15, 0, RED); b.put('cone', 16, 15, 0, RED); b.put('cone', 15, 16, 0, RED); b.put('cone', 16, 16, 0, RED);
				return b.done();
			} },
		{ id: 'duck', cat: 'kids', name: 'Duck', emoji: '🦆', desc: 'A yellow duck with an orange beak and black eyes.',
			make: function () {
				var b = B();
				b.put('b2x6', 11, 14, 0, YEL); b.put('b2x6', 11, 16, 0, YEL);
				b.put('b2x4', 12, 15, 0, YEL); b.put('s1x2', 10, 15, 1, YEL);
				b.put('b2x2', 16, 15, 0, YEL); b.put('b2x2', 16, 15, 0, YEL);
				b.put('p1x2', 17, 15, 0, ORA); b.put('p1x2', 17, 16, 0, ORA);
				b.put('t1x1', 16, 15, 0, BLK); b.put('t1x1', 16, 16, 0, BLK);
				b.put('t2x4', 12, 15, 0, WHT);
				return b.done();
			} },
		{ id: 'rainbow', cat: 'kids', name: 'Rainbow', emoji: '🌈', desc: 'Each colour steps in a little until the two sides meet at the top.',
			make: function () {
				var b = B(), cols = [RED, ORA, YEL, GRN, BLUE, PUR];
				for (var k = 0; k < 6; k++) { b.put('b1x4', 6 + k, 15, 0, cols[k]); b.put('b1x4', 22 - k, 15, 0, cols[k]); }
				b.put('b1x8', 12, 15, 0, PUR);
				return b.done();
			} },
		{ id: 'snowman', cat: 'kids', name: 'Snowman', emoji: '⛄', desc: 'Three white balls (well, blocks), a hat, eyes and buttons.',
			make: function () {
				var b = B();
				b.put('b2x4', 14, 14, 0, WHT); b.put('b2x4', 14, 16, 0, WHT);
				b.put('b2x4', 14, 14, 1, WHT); b.put('b2x4', 16, 14, 1, WHT);
				b.put('b2x2', 15, 15, 0, WHT); b.put('b2x2', 15, 15, 0, WHT);
				b.put('r2x2', 15, 15, 0, WHT);
				b.put('p2x2', 15, 15, 0, BLK); b.put('r1x1', 15, 15, 0, BLK); b.put('r1x1', 16, 16, 0, BLK);
				b.put('t1x1', 15, 14, 0, ORA, 9);
				return b.done();
			} },
		{ id: 'flower', cat: 'kids', name: 'Flower', emoji: '🌸', desc: 'A green stem with leaves, pink petals and a yellow middle.',
			make: function () {
				var b = B();
				b.put('p4x4', 14, 14, 0, BRN);
				for (var i = 0; i < 4; i++) b.put('b1x1', 15, 15, 0, GRN);
				b.put('p1x3', 14, 15, 0, PNK); b.put('p1x3', 15, 14, 1, PNK);
				b.put('rp1x1', 15, 15, 0, YEL);
				b.put('t1x2', 14, 14, 1, GRN); b.put('t1x2', 16, 16, 1, DGR);
				return b.done();
			} },
		{ id: 'robot', cat: 'kids', name: 'Robot', emoji: '🤖', desc: 'Square legs, a blue body, arms and a head with red eyes.',
			make: function () {
				var b = B();
				for (var i = 0; i < 2; i++) { b.put('b2x2', 13, 15, 0, LG); b.put('b2x2', 17, 15, 0, LG); }
				b.put('b2x6', 13, 15, 0, BLUE); b.put('b2x6', 13, 15, 0, BLUE); b.put('b2x6', 13, 15, 0, BLUE);
				b.put('p2x8', 12, 15, 0, DG);
				b.put('b1x2', 12, 15, 1, LG, 12); b.put('b1x2', 19, 15, 1, LG, 12);
				b.put('b2x2', 15, 15, 0, LG); b.put('b2x2', 15, 15, 0, LG);
				b.put('t1x1', 15, 15, 0, RED); b.put('t1x1', 16, 15, 0, RED);
				b.put('r1x1', 15, 16, 0, YEL);
				return b.done();
			} },
		{ id: 'pyramid', cat: 'kids', name: 'Pyramid', emoji: '🔺', desc: 'Square layers that get smaller: 8, 6, 4, then 2 studs wide.',
			make: function () {
				var b = B(), s, k;
				for (s = 8, k = 0; s >= 2; s -= 2, k++) for (var z = 0; z < s; z += 2) b.put('b2x' + s, 12 + k, 12 + k + z, 0, k % 2 ? SAND : TAN);
				return b.done();
			} },
		{ id: 'castle', cat: 'kids', name: 'Castle tower', emoji: '🏰', desc: 'A square tower with a doorway and battlements on top.',
			make: function () {
				var b = B();
				b.put('p8x8', 12, 12, 0, DG);
				b.walls(12, 12, 8, 8, 8, LG, 1, function (x, z, row) { return z === 12 && (x === 15 || x === 16) && row < 3 ? 1 : 0; });
				b.put('p8x8', 12, 12, 0, DG);
				for (var x = 12; x < 20; x += 2) { b.put('b1x1', x, 12, 0, LG); b.put('b1x1', x, 19, 0, LG); }
				for (var z = 14; z < 19; z += 2) { b.put('b1x1', 12, z, 0, LG); b.put('b1x1', 19, z, 0, LG); }
				b.put('r1x1', 15, 15, 0, BRN); b.put('r1x1', 15, 15, 0, BRN); b.put('p1x2', 15, 15, 0, RED);
				return b.done();
			} },
		{ id: 'heart', cat: 'kids', name: 'Heart picture', emoji: '❤️', desc: 'Pixel art standing up: each row of bricks overlaps the row below so it holds together.',
			make: function () {
				var b = B(), z = 15;
				b.put('b1x1', 15, z, 0, RED);
				b.put('b1x3', 14, z, 0, RED);
				b.put('b1x3', 13, z, 0, RED); b.put('b1x2', 16, z, 0, RED);
				b.put('b1x4', 12, z, 0, RED); b.put('b1x3', 16, z, 0, RED);
				b.put('b1x3', 12, z, 0, RED); b.put('b1x4', 15, z, 0, RED);
				b.put('b1x2', 13, z, 0, RED); b.put('b1x2', 16, z, 0, RED);
				return b.done();
			} },
		{ id: 'boat', cat: 'kids', name: 'Sail boat', emoji: '⛵', desc: 'A brown hull on blue water, with a mast and a flag.',
			make: function () {
				var b = B();
				b.put('p8x16', 8, 12, 0, BLUE);
				b.put('p4x8', 12, 14, 0, BRN);
				b.put('b1x6', 12, 14, 0, BRN); b.put('b1x6', 12, 17, 0, BRN); b.put('b1x2', 12, 15, 1, BRN);
				b.put('s4x2', 18, 14, 1, BRN);
				for (var i = 0; i < 5; i++) b.put('r1x1', 15, 15, 0, BRN);
				b.put('p1x3', 15, 15, 0, WHT); b.put('b1x2', 15, 15, 0, RED);
				return b.done();
			} },

		// ---------------- engineering ----------------
		{ id: 'beam-bridge', cat: 'eng', name: 'Beam bridge', emoji: '🌉', desc: 'Two piers and a flat deck. The deck bends like a beam: try the Strength test and press "Find the breaking load".',
			make: function () {
				var b = B();
				for (var i = 0; i < 4; i++) { b.put('b2x4', 7, 14, 1, LG); b.put('b2x4', 23, 14, 1, LG); }
				var d = b.put('p2x16', 8, 14, 0, DG); b.put('p2x16', 8, 16, 0, DG);
				b.load(d, 200);
				return b.done({ test: d });
			} },
		{ id: 'thin-thick', cat: 'eng', name: 'Thin deck vs thick deck', emoji: '📏', desc: 'The same span twice: one plate thick and three plates thick (staggered so the joints do not line up). Same 200 g weight on each.',
			make: function () {
				var b = B();
				for (var i = 0; i < 3; i++) { b.put('b2x2', 6, 6, 0, LG); b.put('b2x2', 22, 6, 0, LG); b.put('b2x2', 6, 22, 0, LG); b.put('b2x2', 22, 22, 0, LG); }
				var thin = b.put('p2x16', 7, 6, 0, RED);
				b.put('p2x16', 7, 22, 0, BLUE); b.put('p2x4', 7, 22, 0, BLUE); b.put('p2x8', 11, 22, 0, BLUE); b.put('p2x4', 19, 22, 0, BLUE);
				var top = b.put('p2x16', 7, 22, 0, BLUE);
				b.load(thin, 200); b.load(top, 200);
				return b.done({ test: thin });
			} },
		{ id: 'arch-bridge', cat: 'eng', name: 'Arch bridge', emoji: '🌁', desc: 'Arches push their load sideways into the ground, so a curved bridge can be light and strong.',
			make: function () {
				var b = B();
				for (var z = 14; z < 18; z++) b.put('a1x12', 10, z, 0, TAN);
				for (z = 14; z < 18; z++) { b.put('b1x2', 8, z, 0, TAN); b.put('b1x2', 22, z, 0, TAN); b.put('b1x2', 8, z, 0, TAN); b.put('b1x2', 22, z, 0, TAN); b.put('b1x2', 8, z, 0, TAN); b.put('b1x2', 22, z, 0, TAN); }
				var d = b.put('p4x12', 10, 14, 0, DG);
				b.put('p4x4', 6, 14, 0, DG); b.put('p4x4', 22, 14, 0, DG);
				b.load(d, 500);
				return b.done({ test: d });
			} },
		{ id: 'corbel', cat: 'eng', name: 'Corbel arch', emoji: '🧱', desc: 'The oldest way to bridge a gap: each brick sticks out a little past the one below. It stands because the weight stays over the bricks underneath.',
			make: function () {
				var b = B();
				for (var k = 0; k < 6; k++) { b.put('b1x4', 6 + k, 15, 0, k % 2 ? LG : DG); b.put('b1x4', 22 - k, 15, 0, k % 2 ? LG : DG); }
				var top = b.put('b1x8', 12, 15, 0, DG);
				b.load(top, 100);
				return b.done({ test: top });
			} },
		{ id: 'cantilever-bridge', cat: 'eng', name: 'Cantilever bridge', emoji: '🏗️', desc: 'Two towers each hold an arm out on both sides, balanced like a seesaw. A short middle piece joins the arms.',
			make: function () {
				var b = B();
				for (var i = 0; i < 4; i++) { b.put('b2x4', 10, 14, 1, DRD); b.put('b2x4', 20, 14, 1, DRD); }
				b.put('p4x8', 7, 14, 0, DRD); b.put('p4x8', 17, 14, 0, DRD);
				b.put('p4x6', 4, 14, 0, DRD); b.put('p4x6', 22, 14, 0, DRD);
				var mid = b.put('p4x6', 13, 14, 0, DG);
				b.load(mid, 200);
				return b.done({ test: mid });
			} },
		{ id: 'bonds', cat: 'eng', name: 'Brick patterns: stacked vs staggered', emoji: '🧱', desc: 'Left: bricks right on top of each other make separate columns that are not joined at all. Right: staggered bricks lock the whole wall together. Look at "Separate pieces" in the Strength tab.',
			make: function () {
				var b = B();
				for (var r = 0; r < 6; r++) for (var x = 4; x < 16; x += 4) b.put('b1x4', x, 10, 0, RED);
				for (r = 0; r < 6; r++) b.run('x', 20, 18, 29, r * 3, BLUE, r);
				return b.done();
			} },
		{ id: 'crane', cat: 'eng', name: 'Crane with counterweight', emoji: '🏗️', desc: 'The baseplate grip is off here, so the crane can tip. The dark weights behind the tower balance the long arm. Put a weight on the hook and see when it tips.',
			make: function () {
				var b = B();
				b.put('p8x8', 12, 12, 0, YEL);
				for (var i = 0; i < 8; i++) b.put('b2x2', 15, 15, 0, YEL);
				var jib = b.put('p2x16', 11, 15, 0, YEL);
				b.put('b2x2', 11, 15, 0, DG); b.put('b2x2', 11, 15, 0, DG); b.put('b2x2', 11, 15, 0, DG);
				var hook = b.put('b1x1', 26, 15, 0, BLK, 22);
				return b.done({ anchored: false, test: hook });
			} },
		{ id: 'overhang', cat: 'eng', name: 'Leaning stack puzzle', emoji: '📚', desc: 'No stud grip at all here, only balance (like stacking books). Five bricks reach a whole brick length past the edge of the bottom one.',
			make: function () {
				var b = B();
				b.put('b1x8', 10, 15, 0, BLUE); b.put('b1x8', 11, 15, 0, SKY); b.put('b1x8', 12, 15, 0, BLUE); b.put('b1x8', 14, 15, 0, SKY); b.put('b1x8', 18, 15, 0, BLUE);
				return b.done({ anchored: false, grip: 'none' });
			} },

		// ---------------- crash test vehicles and targets (not in the Examples window) ----------------
		{ id: 'flimsy-car', cat: 'crash', name: 'Flimsy car', emoji: '🚙', desc: 'Built quickly: the cabin is stacks of bricks right on top of each other, held by only a few studs.',
			make: function () {
				var b = B();
				b.put('wheel', 12, 14, 1, BLK); b.put('wheel', 18, 14, 1, BLK); b.put('wheel', 12, 17, 1, BLK); b.put('wheel', 18, 17, 1, BLK);
				b.put('p4x8', 12, 14, 0, SKY);
				for (var r = 0; r < 3; r++) { b.put('b1x1', 14, 14, 0, SKY); b.put('b1x1', 14, 17, 0, SKY); b.put('b1x1', 16, 14, 0, SKY); b.put('b1x1', 16, 17, 0, SKY); }
				b.put('t4x4', 14, 14, 0, WHT);
				b.put('b1x2', 18, 15, 1, YEL); b.put('b1x2', 12, 15, 1, YEL);
				return b.done();
			} },
		{ id: 'sturdy-car', cat: 'crash', name: 'Sturdy car', emoji: '🚗', desc: 'Built well: two layers of plates that overlap their joints and bricks that overlap each other, so every part is held by many studs.',
			make: function () {
				var b = B();
				b.put('wheel', 12, 14, 1, BLK); b.put('wheel', 18, 14, 1, BLK); b.put('wheel', 12, 17, 1, BLK); b.put('wheel', 18, 17, 1, BLK);
				b.put('p4x8', 12, 14, 0, GRN); b.put('p2x8', 12, 14, 0, GRN); b.put('p2x8', 12, 16, 0, GRN);
				b.put('b2x4', 12, 14, 1, DGR); b.put('b2x4', 18, 14, 1, DGR);
				b.put('b2x4', 14, 14, 1, GLS); b.put('b2x4', 16, 14, 1, GLS);
				b.put('p4x6', 13, 14, 0, GRN);
				b.put('b2x4', 14, 14, 1, GRN);
				b.put('s4x2', 18, 14, 3, GRN, 7); b.put('s4x2', 12, 14, 1, GRN, 7);
				return b.done();
			} },
		{ id: 'truck', cat: 'crash', name: 'Dump truck', emoji: '🚚', desc: 'A long truck with a cab in front and a load of loose bricks in the back.',
			make: function () {
				var b = B();
				b.put('wheel', 10, 14, 1, BLK); b.put('wheel', 18, 14, 1, BLK); b.put('wheel', 10, 17, 1, BLK); b.put('wheel', 18, 17, 1, BLK);
				b.put('p4x12', 9, 14, 0, DG);
				b.put('b2x4', 18, 14, 1, YEL); b.put('b2x4', 18, 14, 1, GLS); b.put('p4x4', 17, 14, 0, YEL);
				b.put('b1x8', 9, 14, 0, ORA); b.put('b1x8', 9, 17, 0, ORA); b.put('b1x2', 9, 15, 1, ORA);
				for (var i = 0; i < 4; i++) b.put('b1x1', 11 + i % 2 * 3, 15 + (i >> 1), 0, [RED, BLUE, YEL, GRN][i]);
				return b.done();
			} },
		{ id: 'brick-wall', cat: 'target', name: 'Brick wall', emoji: '🧱', desc: 'A one-stud-thick wall in a staggered pattern, stuck to its baseplate.',
			make: function () {
				var b = B();
				for (var r = 0; r < 7; r++) b.run('z', 0, 0, 23, r * 3, r % 2 ? DRD : RED, r);
				return b.done();
			} },

		// ---------------- challenges ----------------
		{ id: 'river', cat: 'chal', name: 'Challenge: cross the river', emoji: '🏞️', desc: 'Build a bridge from one bank to the other that holds 1 kg in the middle. The banks and water are fixed; press "Check my build" when you are done.',
			challenge: { kind: 'span', from: 9, to: 22, mid: [15, 15], need: 1000 },
			make: function () {
				var b = B();
				for (var z = 10; z < 22; z += 2) for (var r = 0; r < 2; r++) { b.put('b2x6', 4, z, 0, LG); b.put('b2x6', 22, z, 0, LG); }
				for (z = 10; z < 22; z += 4) for (var x = 10; x < 22; x += 4) b.put('t4x4', x, z, 0, SKY);
				return b.done({ fixed: true });
			} },
		{ id: 'reach', cat: 'chal', name: 'Challenge: reach out', emoji: '👉', desc: 'Starting from the wall, build an arm that reaches past the red line (10 studs out) and holds 50 g at its far end.',
			challenge: { kind: 'reach', x: 16, need: 50 },
			make: function () {
				var b = B();
				b.put('p4x4', 2, 14, 0, DG);
				for (var r = 0; r < 6; r++) { b.put('b2x4', 2, 14, 1, DG); b.put('b2x4', 4, 14, 1, DG); }
				for (var z = 10; z < 22; z += 2) b.put('t1x2', 16, z, 1, RED);
				return b.done({ fixed: true });
			} }
	];
	if (typeof module === 'object' && module.exports) module.exports = EX; else root.BB_EXAMPLES = EX;
})(typeof window !== 'undefined' ? window : this);

/* MES Brick Builder: crash test (window.BBCrash(api) is called by app.js once the 3D view is ready).
 * Which joints give way is MESBrick.crashSplit (stud grip against the force needed to stop each part); the flying
 * pieces are simple rigid bodies (gravity, bounces on the road and walls, friction, spin). Millimetres, grams, seconds. */
(function () {
	'use strict';
	if (typeof window === 'undefined' || window.BBCrash) return;
	window.BBCrash = function (A) {
		var T = A.T, M = A.M, EX = window.BB_EXAMPLES || [], S = A.S, scene = A.scene, camera = A.camera, orbit = A.orbit;
		var $ = function (id) { return document.getElementById(id); };
		var PX = M.STUD, PY = M.PLATE, G = 9810, H = 1 / 900;
		var CAPS = { loose: 0.8, normal: 1.5, tight: 3 };
		var TGT = { concrete: { name: 'concrete wall', dt: 0.0015, e: 0.12 }, bricks: { name: 'brick wall', dt: 0.0025, e: 0.1 }, headon: { name: 'another car', dt: 0.0025, e: 0.08 }, foam: { name: 'foam wall', dt: 0.02, e: 0.04 } };
		var D = { cveh: 'flimsy-car', ctgt: 'concrete', cspd: 15, cgrip: 'normal', cslow: 0.25, ccam: 'follow', csnd: true, crot: 0 };
		for (var k in D) if (S[k] === undefined) S[k] = D[k];
		var root = new T.Group(); root.visible = false; scene.add(root);
		var env = new T.Group(); root.add(env);
		var bodies = [], wall = null, active = false, running = false, simT = 0, accT = 0, lastFrame = 0, rngS = 1, plane = null, stats = null, shake = 0, done = false;
		var XW = 0, WALL_H = 130, WALL_W = 640;

		function rng() { rngS = (rngS + 0x6D2B79F5) | 0; var t = Math.imul(rngS ^ (rngS >>> 15), 1 | rngS); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
		function V(x, y, z) { return new T.Vector3(x, y, z); }

		// ---------- scene ----------
		var MATS = {};
		function mat(hex, o) { var k = hex + JSON.stringify(o || {}); if (!MATS[k]) { var p = { color: new T.Color(hex), roughness: 0.85 }; for (var q in o || {}) p[q] = o[q]; MATS[k] = new T.MeshStandardMaterial(p); } return MATS[k]; }
		function buildEnv() {
			while (env.children.length) env.remove(env.children[0]);
			var road = new T.Mesh(new T.BoxGeometry(7000, 4, 1600), mat('#6b7078')); road.position.set(-2400, -2, 0); road.receiveShadow = true; env.add(road);
			var grass = new T.Mesh(new T.BoxGeometry(7000, 2, 5000), mat('#6aa84f')); grass.position.set(-2400, -4, 0); grass.receiveShadow = true; env.add(grass);
			for (var x = -5600; x < 900; x += 300) { var dsh = new T.Mesh(new T.BoxGeometry(150, 0.6, 10), mat('#f5f5f5')); dsh.position.set(x, 0.3, 0); env.add(dsh); }
			[-760, 760].forEach(function (z) { var l = new T.Mesh(new T.BoxGeometry(7000, 0.6, 12), mat('#f5d547')); l.position.set(-2400, 0.3, z); env.add(l); });
			var t = TGT[S.ctgt];
			if (S.ctgt === 'concrete' || S.ctgt === 'foam') {
				var w = new T.Mesh(new T.BoxGeometry(80, WALL_H, WALL_W), S.ctgt === 'foam' ? mat('#f2d98a', { roughness: 1 }) : mat('#a3a7ad'));
				w.position.set(XW + 40, WALL_H / 2, 0); w.castShadow = true; w.receiveShadow = true; env.add(w);
				if (S.ctgt === 'concrete') for (var i = 0; i < 16; i++) { var st = new T.Mesh(new T.BoxGeometry(2, 14, WALL_W / 16), mat(i % 2 ? '#1f2933' : '#f2c94c')); st.position.set(XW - 0.5, 10, -WALL_W / 2 + (i + 0.5) * WALL_W / 16); env.add(st); }
			}
			if (S.ctgt === 'bricks') makeWall();
			else wall = null;
			A.sunTo(V(-300, 0, 0), 1800);
		}
		function makeWall() {
			var m = EX.filter(function (e) { return e.id === 'brick-wall'; })[0].make(), w = new M.World(64);
			w.load(M.normList(m.parts));
			var D0 = 0; w.parts.forEach(function (p) { D0 = Math.max(D0, p.z + M.size(M.BY[p.t], p.r)[1]); });
			var g = new T.Group(); g.position.set(XW, 0, -D0 * PX / 2); env.add(g);
			var meshes = {};
			w.parts.forEach(function (p) { var me = new T.Mesh(A.geoFor(p.t), A.matFor(p.c)); A.placeMesh(me, p); me.castShadow = true; me.receiveShadow = true; g.add(me); meshes[p.u] = me; });
			wall = { w: w, g: g, meshes: meshes, ox: XW, oz: -D0 * PX / 2, hit: false };
		}

		// ---------- bodies ----------
		// a body = some parts (grid coordinates of the original build) moving as one rigid piece
		function partBox(p) { var d = M.BY[p.t], s = M.size(d, p.r); return [p.x * PX, p.y * PY, p.z * PX, (p.x + s[0]) * PX, (p.y + d.h) * PY, (p.z + s[1]) * PX]; }
		function makeBody(parts, from, kind) {
			var m = 0, c = V(0, 0, 0);
			parts.forEach(function (p) { var b = partBox(p), pm = M.BY[p.t].mass; m += pm; c.x += pm * (b[0] + b[3]) / 2; c.y += pm * (b[1] + b[4]) / 2; c.z += pm * (b[2] + b[5]) / 2; });
			c.multiplyScalar(1 / m);
			var g = new T.Group(), pts = [], I = 0;
			parts.forEach(function (p) {
				var me = new T.Mesh(A.geoFor(p.t), A.matFor(p.c)); A.placeMesh(me, p); me.position.sub(c); me.castShadow = true; me.receiveShadow = true;
				if (M.BY[p.t].shape === 'wheel') {   // spin wheels about their axle, not their bottom
					var wr = M.BY[p.t].h * PY / 2, piv = new T.Group(); piv.position.copy(me.position); piv.position.y += wr; piv.rotation.copy(me.rotation); piv.rotation.order = 'YXZ';
					me.position.set(0, -wr, 0); me.rotation.set(0, 0, 0); piv.add(me); piv.userData.wheelR = wr; g.add(piv);
				} else g.add(me);
				var b = partBox(p), pm = M.BY[p.t].mass;
				for (var i = 0; i < 8; i++) pts.push(V((i & 1 ? b[3] : b[0]) - c.x, (i & 2 ? b[4] : b[1]) - c.y, (i & 4 ? b[5] : b[2]) - c.z));
				var cx = (b[0] + b[3]) / 2 - c.x, cy = (b[1] + b[4]) / 2 - c.y, cz = (b[2] + b[5]) / 2 - c.z, sx = b[3] - b[0], sy = b[4] - b[1], sz = b[5] - b[2];
				I += pm * (cx * cx + cy * cy + cz * cz + (sx * sx + sy * sy + sz * sz) / 12);
			});
			var w = new M.World(256); parts.forEach(function (p) { w.add(p, true); });
			var R = 0; pts.forEach(function (p) { R = Math.max(R, p.length()); });
			var b = { parts: parts, w: w, com: c, m: m, I: Math.max(I, m * 20), pts: pts, R: R, g: g, pos: V(0, 0, 0), q: new T.Quaternion(), v: V(0, 0, 0), om: V(0, 0, 0), roll: false, cool: 0, rest: 0, kind: kind || 'car', side: 1, dist: 0 };
			if (from) {   // place it where it sits inside the body it came from
				b.q.copy(from.q); b.pos.copy(c).sub(from.com).applyQuaternion(from.q).add(from.pos);
				var r = b.pos.clone().sub(from.pos); b.v.copy(from.v).add(from.om.clone().cross(r)); b.om.copy(from.om); b.side = from.side;
			}
			g.position.copy(b.pos); g.quaternion.copy(b.q); root.add(g);
			return b;
		}
		function vehicleList() {
			var list = S.cveh === 'mine' ? A.world().list() : (EX.filter(function (e) { return e.id === S.cveh; })[0] || EX[1]).make().parts;
			list = M.normList(list);
			for (var i = 0; i < (S.crot & 3); i++) list = M.normList(M.rotList(list));
			return list.map(function (p, i) { p.u = i + 1; return p; });
		}
		function reset() {
			running = false; done = false; simT = 0; accT = 0; plane = null; shake = 0; rngS = 12345;
			bodies.forEach(function (b) { root.remove(b.g); }); bodies = [];
			buildEnv();
			var list = vehicleList();
			stats = { n: list.length, v: S.cspd / 3.6 * 1000, impact: false, peak: 0, brokenOff: 0, wallOut: 0, ma: 0 };
			if (!list.length) { status('Build something first, or pick a ready-made car.'); return; }
			var sp = stats.v, len = 0, wid = 0; list.forEach(function (p) { var s = M.size(M.BY[p.t], p.r); len = Math.max(len, (p.x + s[0]) * PX); wid = Math.max(wid, (p.z + s[1]) * PX); });
			var start = Math.min(2600, Math.max(260, sp * 0.9));
			var a = makeBody(list, null, 'car'); a.roll = true; stats.m = a.m;
			a.pos.set(XW - start - len / 2 + (a.com.x - len / 2), a.com.y + 0.01, a.com.z - wid / 2);
			a.v.set(sp, 0, 0); a.g.position.copy(a.pos); bodies.push(a);
			if (S.ctgt === 'headon') {
				var b = makeBody(list, null, 'car'); b.roll = true; b.side = -1;
				b.q.setFromAxisAngle(V(0, 1, 0), Math.PI);
				b.pos.set(-a.pos.x, a.pos.y, -a.pos.z); b.v.set(-sp, 0, 0); b.g.position.copy(b.pos); b.g.quaternion.copy(b.q); bodies.push(b);
				plane = { x: XW, on: true };
			}
			setCam(true); results(); A.dirty();
			status('Ready: ' + list.length + ' parts at ' + S.cspd + ' km/h into the ' + TGT[S.ctgt].name + '. Press 💥 Go!');
		}

		// ---------- breaking ----------
		// the body hits something moving along world direction dir at speed vn (mm/s): which joints let go?
		function shatter(b, dir, vn, dt) {
			if (b.parts.length < 2) return [b];
			var loc = dir.clone().applyQuaternion(b.q.clone().invert()), ax = [Math.abs(loc.x), Math.abs(loc.y), Math.abs(loc.z)], k = ax.indexOf(Math.max.apply(null, ax)), sg = loc.getComponent(k) > 0 ? 1 : -1;
			var d = [0, 0, 0]; d[k] = sg;
			var ext = -1e9; b.w.parts.forEach(function (p) { M.cellsOf(p).forEach(function (c) { ext = Math.max(ext, c[k] * sg); }); });
			var roots = b.w.parts.filter(function (p) { return M.cellsOf(p).some(function (c) { return c[k] * sg === ext; }); }).map(function (p) { return { u: p.u, push: true }; });
			var acc = vn / 1000 / dt;
			var r = M.crashSplit(b.w, { dir: d, cap: CAPS[S.cgrip], root: roots, load: function (u) { return M.BY[b.w.byU[u].t].mass / 1000 * acc; } });
			if (b.kind === 'car' && !stats.impact) { stats.impact = true; stats.peak = b.m / 1000 * acc; stats.ma = acc / 9.81; }
			if (r.groups.length < 2) return [b];
			root.remove(b.g);
			var out = r.groups.map(function (g) {
				var nb = makeBody(g.parts.map(function (u) { return b.w.byU[u]; }), b, b.kind);
				nb.held = g.held; nb.cool = 0.06; return nb;
			});
			// pieces that let go keep flying; they tumble up and sideways off whatever stopped the rest
			out.forEach(function (nb) {
				if (nb.held) return;
				var up = 0.25 + rng() * 0.45, sd = (rng() - 0.5) * 0.7;
				nb.v.addScaledVector(V(0, 1, 0), vn * up).addScaledVector(V(-dir.z, 0, dir.x), vn * sd * 0.6);
				nb.om.add(V(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(vn / 45));
			});
			sound(Math.min(1, vn / 6000), Math.min(1, r.broken / 6) + 0.2);
			return out;
		}

		// ---------- physics ----------
		var tmp = V(0, 0, 0), tmp2 = V(0, 0, 0);
		function impulse(b, r, n, e, mu) {
			var vp = b.v.clone().add(b.om.clone().cross(r)), vn = vp.dot(n);
			if (vn >= 0) return 0;
			var rn = r.clone().cross(n), j = -(1 + e) * vn / (1 / b.m + rn.lengthSq() / b.I);
			b.v.addScaledVector(n, j / b.m); b.om.addScaledVector(rn, j / b.I);
			var vt = vp.clone().addScaledVector(n, -vn), vtl = vt.length();
			if (vtl > 1e-6 && mu > 0) {
				var t = vt.multiplyScalar(-1 / vtl), rt = r.clone().cross(t), jt = Math.min(mu * j, vtl / (1 / b.m + rt.lengthSq() / b.I));
				b.v.addScaledVector(t, jt / b.m); b.om.addScaledVector(rt, jt / b.I);
			}
			return -vn;
		}
		function wallCell(p) {
			if (!wall) return 0;
			var gx = Math.floor((p.x - wall.ox) / PX), gy = Math.floor(p.y / PY), gz = Math.floor((p.z - wall.oz) / PX);
			return gx >= 0 && gz >= 0 ? wall.w.at(gx, gy, gz) : 0;
		}
		function contacts(b) {
			// deepest point per obstacle: ground (y < 0), the wall face, the head-on plane
			var best = {}, wpts = [];
			for (var i = 0; i < b.pts.length; i++) {
				var p = tmp.copy(b.pts[i]).applyQuaternion(b.q).add(b.pos);
				if (p.y < 0 && (!best.g || p.y < best.g.d)) best.g = { d: p.y, p: p.clone() };
				if ((S.ctgt === 'concrete' || S.ctgt === 'foam') && p.x > XW && p.x < XW + 80 && p.y < WALL_H && Math.abs(p.z) < WALL_W / 2) { var dd = XW - p.x; if (!best.w || dd < best.w.d) best.w = { d: dd, p: p.clone() }; }
				if (S.ctgt === 'bricks' && p.x > XW) { var u = wallCell(p); if (u) { var d2 = XW - p.x; wpts.push(u); if (!best.w || d2 < best.w.d) best.w = { d: d2, p: p.clone() }; } }
				if (plane && plane.on && b.kind === 'car' && (p.x - plane.x) * b.side > 0) { var d3 = -(p.x - plane.x) * b.side; if (!best.h || d3 < best.h.d) best.h = { d: d3, p: p.clone() }; }
			}
			best.wparts = wpts; return best;
		}
		function hitBricks(b, cs, vn) {
			// the car punches the wall: the hit bricks must pass its stopping force to the baseplate through their studs
			var hit = {}; cs.wparts.forEach(function (u) { hit[u] = 1; }); var hu = Object.keys(hit).map(Number); if (!hu.length) return false;
			var F = b.m / 1000 * (vn / 1000) / TGT.bricks.dt, ground = [];
			wall.w.parts.forEach(function (p) { var g = M.cellsOf(p).filter(function (c) { return c[1] === 0; }).length; if (g) ground.push({ u: p.u, grip: g }); });
			var r = M.crashSplit(wall.w, { dir: [1, 0, 0], cap: CAPS[S.cgrip] * 2, root: ground, load: function (u) { return hit[u] ? F / hu.length : M.BY[wall.w.byU[u].t].mass / 1000 * 50; } });
			var gone = false;
			r.groups.forEach(function (g) {
				if (g.held) return;
				var list = g.parts.map(function (u) { return wall.w.byU[u]; }).map(function (p) { return { u: p.u, t: p.t, x: p.x, y: p.y, z: p.z, r: p.r, c: p.c }; });
				list.forEach(function (p) { wall.g.remove(wall.meshes[p.u]); wall.w.remove(p.u); if (hit[p.u]) gone = true; });
				stats.wallOut += list.length;
				var fake = { q: new T.Quaternion(), com: V(0, 0, 0), pos: V(wall.ox, 0, wall.oz), v: V(0, 0, 0), om: V(0, 0, 0), side: 1 };
				var nb = makeBody(list, fake, 'wall');
				nb.v.set(vn * (0.5 + rng() * 0.3), vn * (0.1 + rng() * 0.3), (rng() - 0.5) * vn * 0.3); nb.om.set(rng() - 0.5, rng() - 0.5, rng() - 0.5).multiplyScalar(vn / 60);
				bodies.push(nb);
			});
			return gone;
		}
		function stepBody(b, dt) {
			if (b.rest > 0.35) return;
			b.v.y -= G * dt;
			b.pos.addScaledVector(b.v, dt);
			if (!b.roll) {
				var om = b.om, qd = new T.Quaternion(om.x * dt / 2, om.y * dt / 2, om.z * dt / 2, 0).multiply(b.q);
				b.q.set(b.q.x + qd.x, b.q.y + qd.y, b.q.z + qd.z, b.q.w + qd.w).normalize();
				b.om.multiplyScalar(1 - 0.15 * dt);
			} else b.dist += b.v.x * dt * b.side;
			b.cool -= dt;
			if (b.pos.y - b.R > 1 && b.pos.x + b.R < XW - 1 && !plane) return;
			var cs = contacts(b), list = [];
			if (cs.w || cs.h) {
				var c = cs.w || cs.h, n = cs.w ? V(-1, 0, 0) : V(-b.side, 0, 0), r = c.p.clone().sub(b.pos), vn = -(b.v.clone().add(b.om.clone().cross(r))).dot(n);
				if (vn > 0) {
					var tg = TGT[S.ctgt];
					if (cs.w && S.ctgt === 'bricks' && b.kind === 'car' && vn > 300 && !b.wallHit) {
						b.wallHit = true;
						if (hitBricks(b, cs, vn)) { b.v.multiplyScalar(0.55); vn *= 0.45; }
					}
					if (b.cool <= 0 && vn > 500) {
						if (b.kind === 'car' && b.roll) { stats.hitT = simT; shake = Math.min(1, vn / 5000); if (plane) plane.offAt = simT + 0.3; }
						b.roll = false;
						var parts = shatter(b, n.clone().negate(), vn, tg.dt);
						if (parts.length > 1) { list = parts; }
					}
				}
				if (list.length) return list;
				b.roll = false;
				b.pos.addScaledVector(n, -c.d + 0.01);
				var hv = impulse(b, r, n, TGT[S.ctgt].e, 0.3); if (hv > 900) sound(Math.min(1, hv / 8000) * 0.5, 0.15);
			}
			if (cs.g) {
				var rg = cs.g.p.clone().sub(b.pos), ng = V(0, 1, 0);
				b.pos.y -= cs.g.d - 0.01;
				if (b.roll) { if (b.v.y < 0) b.v.y = 0; }
				else {
					var vg = -(b.v.clone().add(b.om.clone().cross(rg))).dot(ng);
					if (vg > 1300 && b.cool <= 0 && b.parts.length > 1) { var ps = shatter(b, V(0, -1, 0), vg, 0.002); if (ps.length > 1) return ps; }
					var h2 = impulse(b, rg, ng, 0.25, 0.5); if (h2 > 700) sound(Math.min(1, h2 / 9000) * 0.35, 0.08);
					b.v.x *= 1 - 1.5 * dt; b.v.z *= 1 - 1.5 * dt; b.om.multiplyScalar(1 - 2.5 * dt);
					if (b.v.length() < 25 && b.om.length() < 0.6) b.rest += dt; else b.rest = 0;
				}
			}
			return null;
		}
		function step(dt) {
			simT += dt;
			if (plane && plane.offAt && simT > plane.offAt) plane.on = false;
			var next = [];
			bodies.forEach(function (b) { var r = stepBody(b, dt); if (r) r.forEach(function (x) { next.push(x); }); else next.push(b); });
			bodies = next;
		}
		function sync() {
			bodies.forEach(function (b) {
				b.g.position.copy(b.pos); b.g.quaternion.copy(b.q);
				if (b.roll) b.g.children.forEach(function (me) { if (me.userData.wheelR) me.rotation.x = -b.dist / me.userData.wheelR; });
			});
		}

		// ---------- camera ----------
		function main() { var best = null; bodies.forEach(function (b) { if (b.kind === 'car' && (!best || b.parts.length > best.parts.length)) best = b; }); return best; }
		function setCam(jump) {
			var b = main(); if (!b) return;
			var sz = Math.max(140, b.R * 2.2), tgt, pos;
			if (S.ccam === 'follow') { var x = Math.min(b.pos.x, XW + 100); tgt = V(x + sz * 0.6, sz * 0.25, 0); pos = V(x - sz * 1.4, sz * 1.0, sz * 2.3); }
			else if (S.ccam === 'side') { tgt = V(XW - sz * 0.8, sz * 0.25, 0); pos = V(XW - sz * 0.8, sz * 0.7, sz * 4.2); }
			else if (S.ccam === 'top') { tgt = V(XW - sz * 1.2, 0, 0); pos = V(XW - sz * 1.2, sz * 5.5, 1); }
			else { if (!jump) return; tgt = V(XW - sz, sz * 0.25, 0); pos = V(XW - sz * 3, sz * 1.6, sz * 2.6); }
			if (jump) { orbit.target.copy(tgt); camera.position.copy(pos); }
			else { orbit.target.lerp(tgt, 0.12); camera.position.lerp(pos, 0.12); }
			orbit.update();
		}

		// ---------- sound ----------
		var ac = null, noise = null;
		function sound(vol, len) {
			if (!S.csnd || vol < 0.03) return;
			try {
				if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); var n = ac.sampleRate, buf = ac.createBuffer(1, n, n), d = buf.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; noise = buf; }
				if (ac.state === 'suspended') ac.resume();
				var t0 = ac.currentTime, src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
				src.buffer = noise; f.type = 'bandpass'; f.frequency.value = 900 + 2600 * Math.random(); f.Q.value = 0.9;
				var dur = 0.04 + len * 0.5; g.gain.setValueAtTime(Math.min(0.9, vol), t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
				src.connect(f); f.connect(g); g.connect(ac.destination); src.start(t0, Math.random() * 0.5, dur + 0.05);
			} catch (e) {}
		}

		// ---------- results ----------
		function status(t) { $('bb-cstat').textContent = t || ''; }
		function results() {
			var box = $('bb-cres'); if (!stats) { box.innerHTML = ''; return; }
			var v = stats.v / 1000, cars = bodies.filter(function (b) { return b.kind === 'car'; }), big = main(), nCar = S.ctgt === 'headon' ? stats.n * 2 : stats.n;
			var kept = big ? big.parts.length : 0, pieces = cars.length, h = v * v / 2 / 9.81 * 100;
			var rows = '<tr><th>Speed</th><td>' + S.cspd + ' km/h = ' + v.toFixed(1) + ' m/s</td></tr>' +
				'<tr><th>Like a drop from</th><td>' + (h >= 100 ? (h / 100).toFixed(1) + ' m' : Math.round(h) + ' cm') + '</td></tr>' +
				'<tr><th>Car weight</th><td>' + M.fmtG(stats.m || 0) + '</td></tr>';
			if (stats.impact) rows += '<tr><th>Stopping force</th><td>about ' + stats.peak.toFixed(1) + ' N (' + Math.round(stats.ma) + ' g)</td></tr>' +
				'<tr><th>Pieces</th><td>' + pieces + (S.ctgt === 'headon' ? ' (both cars)' : '') + '</td></tr>' +
				'<tr><th>Biggest piece</th><td>' + kept + ' of ' + (S.ctgt === 'headon' ? stats.n : stats.n) + ' parts (' + Math.round(kept / stats.n * 100) + '%)</td></tr>' +
				(stats.wallOut ? '<tr><th>Wall bricks knocked out</th><td>' + stats.wallOut + '</td></tr>' : '');
			var verdict = !stats.impact ? '' : pieces <= (S.ctgt === 'headon' ? 2 : 1) ? '<p class="bb-good">It survived in one piece. Try it faster!</p>' : kept / stats.n > 0.7 ? '<p class="bb-good">Mostly in one piece: a few parts came off.</p>' : '<p class="bb-bad">💥 Smashed! Only ' + Math.round(kept / stats.n * 100) + '% stayed together.</p>';
			box.innerHTML = '<table class="bb-kv">' + rows + '</table>' + verdict;
		}

		// ---------- controls ----------
		function fill() {
			var opts = [['mine', 'My build'], ['flimsy-car', '🚙 Flimsy car'], ['sturdy-car', '🚗 Sturdy car'], ['car', '🏎️ Race car'], ['truck', '🚚 Dump truck']];
			$('bb-cveh').innerHTML = opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
			$('bb-cveh').value = S.cveh; $('bb-ctgt').value = S.ctgt; $('bb-cspd').value = S.cspd; $('bb-cgrip').value = S.cgrip; $('bb-cslow').value = String(S.cslow); $('bb-ccam').value = S.ccam; $('bb-csnd').checked = S.csnd;
			$('bb-cspdv').textContent = S.cspd + ' km/h';
			function ch(id, key, num, again) { $(id).onchange = function () { S[key] = num ? +this.value : this.value; A.save(); if (again) reset(); }; }
			ch('bb-cveh', 'cveh', false, true); ch('bb-ctgt', 'ctgt', false, true); ch('bb-cgrip', 'cgrip', false, true); ch('bb-cslow', 'cslow', true); ch('bb-ccam', 'ccam', false);
			$('bb-ccam').addEventListener('change', function () { setCam(true); A.dirty(); });
			$('bb-cspd').oninput = function () { S.cspd = +this.value; $('bb-cspdv').textContent = S.cspd + ' km/h'; };
			$('bb-cspd').onchange = function () { A.save(); reset(); };
			$('bb-csnd').onchange = function () { S.csnd = this.checked; A.save(); };
			$('bb-cgo').onclick = go; $('bb-creset').onclick = reset;
			$('bb-cturn').onclick = function () { S.crot = (S.crot + 1) & 3; A.save(); reset(); };
		}
		function go() {
			if (running || done) reset();
			if (!bodies.length) return;
			if (S.csnd) sound(0.001, 0.01);
			running = true; lastFrame = 0; status('Crashing… (' + (S.cslow < 1 ? 'slow motion' : 'real speed') + ')');
		}
		function frame(t) {
			if (!active) return false;
			if (!running) return false;
			var dtr = lastFrame ? Math.min(0.05, (t - lastFrame) / 1000) : 1 / 60; lastFrame = t;
			accT += dtr * S.cslow;
			var n = 0;
			while (accT >= H && n < 600) { step(H); accT -= H; n++; }
			sync(); setCam(false);
			if (shake > 0.01) { camera.position.x += (Math.random() - 0.5) * shake * 6; camera.position.y += (Math.random() - 0.5) * shake * 6; shake *= 0.85; }
			var allRest = bodies.every(function (b) { return b.rest > 0.35; });
			if (stats.impact && (allRest || simT - (stats.hitT || 0) > 5)) { running = false; done = true; status('Done. Press 💥 Go! to crash it again, or change the speed.'); }
			if (simT > 15) { running = false; done = true; }
			results();
			return true;
		}
		function enter() {
			active = true; root.visible = true; A.setBuildVisible(false); reset();
			$('bb-status').textContent = 'Crash test: drag to look around, scroll to zoom. Space bar = Go.';
		}
		function exit() {
			active = false; running = false; root.visible = false; A.setBuildVisible(true); A.sunTo(null);
		}
		fill();
		return { enter: enter, exit: exit, frame: frame, active: function () { return active; }, go: go, reset: reset, debug: function () { return { bodies: bodies.map(function (b) { return [b.kind, b.parts.length, Math.round(b.pos.x), Math.round(b.pos.y), Math.round(b.v.x)]; }), wall: wall && wall.w.parts.length, stats: stats, simT: simT, running: running }; },
			run: function (sec) { if (!running) go(); var steps = Math.round(sec / H); for (var i = 0; i < steps; i++) step(H); sync(); results(); setCam(true); A.dirty(); return { bodies: bodies.length, stats: stats }; } };
	};
})();

/* MES Brick Builder page. Engine = window.MESBrick (lib.js), examples = window.BB_EXAMPLES (templates.js).
 * three.js 0.170.0 + addons come from jsDelivr through the page's import map. Units in the scene: millimetres, Y up. */
(function () {
	'use strict';
	var root = document.getElementById('bb'); if (!root) return;
	var M = window.MESBrick, EX = window.BB_EXAMPLES || [];
	var $ = function (id) { return document.getElementById(id); };
	var imp; try { imp = new Function('u', 'return import(u)'); } catch (e) { imp = null; }
	var T, OrbitControls, BGU;
	var KEY = 'mes-brick-builder:v1', BKEY = 'mes-brick-builder:build';
	var S = { part: 'b2x4', color: 0, rot: 0, tool: 'build', cat: 'brick', size: 32, bcol: 3, shadow: true, ghost: true, studs: true, stress: false, anchored: true, grip: 'normal', lw: 200, tab: 'test' };
	try { var sv = JSON.parse(localStorage.getItem(KEY) || '{}'); for (var k in sv) if (k in S) S[k] = sv[k]; } catch (e) {}
	if (!M.BY[S.part]) S.part = 'b2x4';
	function saveS() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

	var W = new M.World(S.size), loads = {}, fixed = {}, chal = null, testU = 0, stepN = null, hist = [], fut = [], analysis = null;
	var crash = null, wantCrash = false, renderer, scene, camera, orbit, view = $('bb-view'), meshes = {}, ghost, baseGroup, pickList = [], dirty = true, sun;
	var GEO = {}, MAT = {}, SMAT = {};
	var PX = M.STUD, PY = M.PLATE;

	// ---------- small helpers ----------
	function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
	var toastT;
	function toast(msg, ms) { var t = $('bb-toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, ms || 2600); }
	function status(msg) { $('bb-status').textContent = msg || ''; }
	function colHex(i) { return M.COLORS[i] ? M.COLORS[i][1] : '#888888'; }
	function partLabel(p) { return M.BY[p.t].name + ' (' + M.COLORS[p.c][0].toLowerCase() + ')'; }

	// ---------- history / saving ----------
	function snap() { return { p: W.list(), l: loadList(), f: Object.keys(fixed).length ? W.parts.map(function (p) { return fixed[p.u] ? 1 : 0; }) : null }; }
	function loadList() { var out = []; W.parts.forEach(function (p, i) { if (loads[p.u]) out.push([i, loads[p.u]]); }); return out; }
	function restore(s) {
		W.load(s.p); loads = {}; fixed = {};
		(s.l || []).forEach(function (x) { var p = W.parts[x[0]]; if (p) loads[p.u] = x[1]; });
		if (s.f) s.f.forEach(function (v, i) { if (v && W.parts[i]) fixed[W.parts[i].u] = 1; });
		if (testU && !W.byU[testU]) testU = 0;
	}
	function commit() { hist.push(lastSnap); if (hist.length > 300) hist.shift(); fut = []; lastSnap = snap(); persist(); refresh(); }
	var lastSnap = snap(), persistT;
	function persist() {
		clearTimeout(persistT);
		persistT = setTimeout(function () { try { localStorage.setItem(BKEY, JSON.stringify({ size: S.size, s: lastSnap, chal: chal ? chal.id : null })); } catch (e) {} }, 300);
	}
	function undo() { if (!hist.length) return toast('Nothing to undo'); fut.push(lastSnap); lastSnap = hist.pop(); restore(lastSnap); persist(); refresh(); }
	function redo() { if (!fut.length) return toast('Nothing to redo'); hist.push(lastSnap); lastSnap = fut.pop(); restore(lastSnap); persist(); refresh(); }

	// ---------- left panel ----------
	function buildPalette() {
		var c = $('bb-colors');
		c.innerHTML = M.COLORS.map(function (x, i) { return '<button type="button" class="bb-sw" role="radio" data-c="' + i + '" style="background:' + x[1] + '" title="' + esc(x[0]) + '" aria-label="' + esc(x[0]) + '"></button>'; }).join('');
		c.addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (!b) return; S.color = +b.dataset.c; saveS(); markPalette(); if (S.tool === 'pick' || S.tool === 'remove' || S.tool === 'load') setTool(S.tool === 'pick' ? 'build' : S.tool); updateGhostMat(); });
		$('bb-cats').innerHTML = M.CATS.map(function (x) { return '<button type="button" class="bb-cat" role="tab" data-cat="' + x[0] + '">' + x[1] + '</button>'; }).join('');
		$('bb-cats').addEventListener('click', function (e) { var b = e.target.closest('[data-cat]'); if (!b) return; S.cat = b.dataset.cat; $('bb-psearch').value = ''; saveS(); drawParts(); });
		$('bb-psearch').addEventListener('input', drawParts);
		$('bb-parts').addEventListener('click', function (e) { var b = e.target.closest('[data-part]'); if (!b) return; S.part = b.dataset.part; saveS(); if (S.tool !== 'build') setTool('build'); markPalette(); rebuildGhost(); });
		drawParts(); markPalette();
	}
	function partIcon(def) {
		// a little isometric drawing of the part
		var sz = [def.w, def.d], h = def.h, s = Math.min(9, 40 / (sz[0] + sz[1] + 1)), hy = s * 0.42 * h;
		var ox = 24, oy = 6 + Math.max(0, 22 - hy) / 2 + 2;
		function P(x, z, y) { return [(ox + (x - z) * s * 0.87).toFixed(1), (oy + (x + z) * s * 0.5 - y).toFixed(1)]; }
		var col = colHex(S.color), a = P(0, 0, hy), b = P(sz[0], 0, hy), c = P(sz[0], sz[1], hy), d = P(0, sz[1], hy), e = P(sz[0], 0, 0), f = P(sz[0], sz[1], 0), g = P(0, sz[1], 0);
		var top = def.shape === 'round' || def.shape === 'cone' ? '' : '<path d="M' + a + 'L' + b + 'L' + c + 'L' + d + 'Z" fill="' + col + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>';
		var sides = '<path d="M' + b + 'L' + e + 'L' + f + 'L' + c + 'Z" fill="' + col + '" stroke="rgba(0,0,0,.35)" stroke-width=".6" style="filter:brightness(.78)"/><path d="M' + d + 'L' + c + 'L' + f + 'L' + g + 'Z" fill="' + col + '" stroke="rgba(0,0,0,.35)" stroke-width=".6" style="filter:brightness(.62)"/>';
		if (def.shape === 'round' || def.shape === 'cone' || def.shape === 'wheel') {
			var cx = (+a[0] + +c[0]) / 2, cy = (+a[1] + +c[1]) / 2, rr = s * sz[0] * 0.62;
			if (def.shape === 'wheel') return '<svg viewBox="0 0 48 40" aria-hidden="true"><ellipse cx="24" cy="20" rx="' + (s * 1.2 * def.h / 3) + '" ry="' + (s * 1.2 * def.h / 3) + '" fill="' + col + '" stroke="rgba(0,0,0,.4)"/><circle cx="24" cy="20" r="' + (s * 0.5) + '" fill="rgba(255,255,255,.55)"/></svg>';
			sides = '<path d="M' + (cx - rr) + ',' + cy + 'V' + (cy + hy) + 'A' + rr + ',' + rr * 0.5 + ' 0 0 0 ' + (cx + rr) + ',' + (cy + hy) + 'V' + cy + 'Z" fill="' + col + '" style="filter:brightness(.72)" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>';
			top = def.shape === 'cone' ? '<path d="M' + (cx - rr) + ',' + (cy + hy) + 'L' + cx + ',' + (cy - 2) + 'L' + (cx + rr) + ',' + (cy + hy) + 'Z" fill="' + col + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>' : '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rr + '" ry="' + rr * 0.5 + '" fill="' + col + '" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>';
			if (def.shape === 'cone') sides = '';
		}
		var studs = '';
		def.studCells.forEach(function (sc) { if (def.shape === 'round' && def.w > 1) return; var p = P(sc[0] + 0.5, sc[1] + 0.5, hy); studs += '<ellipse cx="' + p[0] + '" cy="' + (p[1] - 1.2) + '" rx="' + (s * 0.33) + '" ry="' + (s * 0.19) + '" fill="' + col + '" stroke="rgba(0,0,0,.35)" stroke-width=".5"/>'; });
		var label = def.shape === 'slope' || def.shape === 'inv' ? '<text x="40" y="38" font-size="8" fill="currentColor">◢</text>' : def.shape === 'arch' ? '<text x="40" y="38" font-size="8" fill="currentColor">⌒</text>' : '';
		return '<svg viewBox="0 0 48 40" aria-hidden="true">' + sides + top + studs + label + '</svg>';
	}
	function drawParts() {
		var q = $('bb-psearch').value.trim().toLowerCase(), list = M.PARTS.filter(function (p) { return q ? (p.name + ' ' + p.id + ' ' + p.cat).toLowerCase().indexOf(q) >= 0 : p.cat === S.cat; });
		$('bb-parts').innerHTML = list.length ? list.map(function (p) { return '<button type="button" class="bb-part" role="option" data-part="' + p.id + '" title="' + esc(p.name) + '">' + partIcon(p) + '<span>' + esc(p.name.replace(/^(Brick|Plate|Smooth tile) /, '')) + '</span></button>'; }).join('') : '<p class="bb-small">No part matches.</p>';
		Array.prototype.forEach.call($('bb-cats').children, function (b) { b.setAttribute('aria-selected', !q && b.dataset.cat === S.cat ? 'true' : 'false'); });
		markPalette();
	}
	function markPalette() {
		Array.prototype.forEach.call($('bb-colors').children, function (b) { b.setAttribute('aria-checked', +b.dataset.c === S.color ? 'true' : 'false'); });
		Array.prototype.forEach.call($('bb-parts').querySelectorAll('[data-part]'), function (b) { b.setAttribute('aria-selected', b.dataset.part === S.part ? 'true' : 'false'); });
		$('bb-cname').textContent = M.COLORS[S.color][0];
		if (markPalette._c !== S.color) { markPalette._c = S.color; Array.prototype.forEach.call($('bb-parts').querySelectorAll('[data-part]'), function (b) { b.firstChild.outerHTML = partIcon(M.BY[b.dataset.part]); }); }
	}
	function setTool(t) {
		S.tool = t; saveS();
		Array.prototype.forEach.call(root.querySelectorAll('.bb-tool'), function (b) { b.setAttribute('aria-pressed', b.dataset.tool === t ? 'true' : 'false'); });
		view.dataset.tool = t;
		if (ghost) ghost.visible = false;
		var tip = { build: 'Click to add a ' + M.BY[S.part].name + '. Shift-click removes. R turns it.', paint: 'Click a brick to paint it ' + M.COLORS[S.color][0].toLowerCase() + '.', remove: 'Click a brick to take it off.', pick: 'Click a brick to copy its part and colour.', load: 'Click a brick to put ' + M.fmtG(S.lw) + ' on it (click again to take it off).' };
		status(tip[t]);
	}

	// ---------- geometry ----------
	function profileGeo(pts, depth) {
		var sh = new T.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
		var g = new T.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: false, curveSegments: 16 });
		g.translate(0, 0, -depth / 2); return g;
	}
	function geoFor(id) {
		if (GEO[id]) return GEO[id];
		var d = M.BY[id], w = d.w * PX, dp = d.d * PX, h = d.h * PY, gap = 0.12, parts = [], g;
		if (d.shape === 'box') { g = new T.BoxGeometry(w - gap, h - 0.06, dp - gap); g.translate(0, h / 2, 0); parts.push(g); }
		else if (d.shape === 'slope' || d.shape === 'inv') {
			// profile across the depth (j = 0 is the high/back row), extruded along the width
			var D = dp - gap, y0 = 0, pts = d.shape === 'slope' ? [[-D / 2, y0], [D / 2, y0], [D / 2, PY], [-D / 2 + PX, h - 0.06], [-D / 2, h - 0.06]] : [[-D / 2, 0], [-D / 2 + PX - gap, 0], [D / 2, h - PY], [D / 2, h - 0.06], [-D / 2, h - 0.06]];
			g = profileGeo(pts, w - gap); g.rotateY(-Math.PI / 2); parts.push(g);
		} else if (d.shape === 'round') { g = new T.CylinderGeometry(w / 2 - gap, w / 2 - gap, h - 0.06, 32); g.translate(0, h / 2, 0); parts.push(g); }
		else if (d.shape === 'cone') { g = new T.CylinderGeometry(2.2, w / 2 - gap, h - 0.06, 28); g.translate(0, h / 2, 0); parts.push(g); }
		else if (d.shape === 'arch') {
			var a = (d.w - 2) / 2 * PX, b = (d.h - 1) * PY, W2 = (w - gap) / 2, H = h - 0.06, ap = [[-W2, 0], [-W2, H], [W2, H], [W2, 0], [a, 0]];
			for (var i = 1; i < 24; i++) { var t = i / 24 * Math.PI; ap.push([a * Math.cos(t), b * Math.sin(t)]); }
			ap.push([-a, 0]);
			parts.push(profileGeo(ap, dp - gap));
		} else if (d.shape === 'wheel') {
			var r = h / 2; g = new T.CylinderGeometry(r - 0.2, r - 0.2, w - 0.6, 36); g.rotateZ(Math.PI / 2); g.translate(0, r, 0); parts.push(g);
			var hub = new T.CylinderGeometry(r * 0.45, r * 0.45, w + 0.4, 20); hub.rotateZ(Math.PI / 2); hub.translate(0, r, 0); parts.push(hub);
		}
		d.studCells.forEach(function (sc) {
			if (d.shape === 'round' && d.w > 1 && !(sc[0] === 0 && sc[1] === 0)) return;
			var st = new T.CylinderGeometry(2.4, 2.4, 1.7, 18), cx = d.shape === 'round' && d.w > 1 ? 0 : (sc[0] + 0.5) * PX - w / 2, cz = d.shape === 'round' && d.w > 1 ? 0 : (sc[1] + 0.5) * PX - dp / 2;
			if (d.shape === 'round' && d.w > 1) st = new T.CylinderGeometry(4.8, 4.8, 1.7, 28);
			st.translate(cx, h + 0.85, cz); parts.push(st);
		});
		parts = parts.map(function (x) { var n = x.index ? x.toNonIndexed() : x; n.clearGroups(); ['uv1', 'uv2'].forEach(function (a) { if (n.attributes[a]) n.deleteAttribute(a); }); if (!n.attributes.uv) n.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2)); return n; });
		g = parts.length > 1 ? BGU.mergeGeometries(parts, false) : parts[0];
		g.computeBoundingBox(); g.computeBoundingSphere();
		GEO[id] = g; return g;
	}
	function matFor(c) {
		if (MAT[c]) return MAT[c];
		var o = { color: new T.Color(colHex(c)), roughness: 0.32, metalness: 0.0 };
		if (c === M.GLASS) { o.transparent = true; o.opacity = 0.45; o.roughness = 0.08; o.depthWrite = false; }
		if (M.COLORS[c][0] === 'Gold') { o.metalness = 0.65; o.roughness = 0.28; }
		return (MAT[c] = new T.MeshStandardMaterial(o));
	}
	function stressMat(s, floating) {
		var k = floating ? 'f' : Math.min(20, Math.round(Math.min(1.25, s) * 16));
		if (SMAT[k]) return SMAT[k];
		var col = new T.Color();
		if (floating) col.set('#d946ef');
		else { var x = Math.min(1, s); if (x < 0.5) col.set('#3b82f6').lerp(new T.Color('#eab308'), x * 2); else col.set('#eab308').lerp(new T.Color('#ef4444'), (x - 0.5) * 2); if (s >= 1) col.set('#b91c1c'); }
		return (SMAT[k] = new T.MeshStandardMaterial({ color: col, roughness: 0.5 }));
	}

	// ---------- scene ----------
	function initScene() {
		renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
		renderer.domElement.className = 'bb-canvas';
		view.insertBefore(renderer.domElement, view.firstChild);
		scene = new T.Scene(); scene.background = new T.Color('#cfe3f4');
		camera = new T.PerspectiveCamera(36, 1, 2, 8000);
		scene.add(new T.HemisphereLight(0xffffff, 0x8a8f99, 1.5));
		sun = new T.DirectionalLight(0xffffff, 2.1); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.4;
		scene.add(sun); scene.add(sun.target);
		orbit = new OrbitControls(camera, renderer.domElement);
		orbit.enableDamping = false; orbit.screenSpacePanning = true; orbit.zoomToCursor = true; orbit.maxPolarAngle = Math.PI * 0.495;
		orbit.addEventListener('change', function () { dirty = true; });
		baseGroup = new T.Group(); scene.add(baseGroup);
		buildBase(); setView('iso', true);
		new ResizeObserver(resize).observe(view); resize();
		pointerSetup();
		requestAnimationFrame(loop);
	}
	function resize() { var w = Math.max(60, view.clientWidth), h = Math.max(60, view.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true; }
	function buildBase() {
		while (baseGroup.children.length) { var c = baseGroup.children.pop(); if (c.geometry && c.geometry !== GEO._stud) c.geometry.dispose(); }
		var N = S.size, L = N * PX, col = new T.Color(colHex(S.bcol));
		var plate = new T.Mesh(new T.BoxGeometry(L, PY, L), new T.MeshStandardMaterial({ color: col, roughness: 0.6 }));
		plate.position.set(L / 2, -PY / 2, L / 2); plate.receiveShadow = true; plate.userData.base = true; baseGroup.add(plate);
		if (S.studs) {
			var sg = new T.CylinderGeometry(2.4, 2.4, 1.7, 14), im = new T.InstancedMesh(sg, plate.material, N * N), m4 = new T.Matrix4(), i = 0;
			for (var x = 0; x < N; x++) for (var z = 0; z < N; z++) { m4.makeTranslation((x + 0.5) * PX, 0.85, (z + 0.5) * PX); im.setMatrixAt(i++, m4); }
			im.receiveShadow = true; im.userData.base = true; baseGroup.add(im);
		}
		sun.position.set(L * 0.2, L * 1.6, L * 1.1); sun.target.position.set(L / 2, 0, L / 2);
		var sc = sun.shadow.camera, r = L * 0.9; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 10; sc.far = L * 4; sc.updateProjectionMatrix();
		renderer.shadowMap.enabled = S.shadow;
		pickList = null; dirty = true;
	}
	function setBuildVisible(on) {
		baseGroup.visible = on; if (ghost) ghost.visible = false;
		Object.keys(meshes).forEach(function (u) { meshes[u].visible = on && (stepN == null || W.parts.indexOf(W.byU[u]) < stepN); });
		$('bb-labels').hidden = !on; root.classList.toggle('bb-crashing', !on); dirty = true;
		if (on) { setView('fit', true); }
	}
	function sunTo(c, r) {
		if (!c) { buildBase(); return; }
		sun.position.set(c.x + r * 0.3, r * 1.2, r * 0.8); sun.target.position.copy(c);
		var sc = sun.shadow.camera; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 10; sc.far = r * 5; sc.updateProjectionMatrix(); dirty = true;
	}
	function placeMesh(m, p) {
		var sz = M.size(M.BY[p.t], p.r);
		m.position.set((p.x + sz[0] / 2) * PX, p.y * PY, (p.z + sz[1] / 2) * PX);
		m.rotation.set(0, -p.r * Math.PI / 2, 0);
	}
	function sync() {
		var seen = {}, vis = stepN == null ? null : {};
		if (vis) W.parts.forEach(function (p, i) { if (i < stepN) vis[p.u] = 1; });
		W.parts.forEach(function (p) {
			seen[p.u] = 1;
			var m = meshes[p.u];
			if (!m || m.userData.t !== p.t) { if (m) scene.remove(m); m = new T.Mesh(geoFor(p.t), matFor(p.c)); m.castShadow = true; m.receiveShadow = true; m.userData.u = p.u; m.userData.t = p.t; scene.add(m); meshes[p.u] = m; }
			placeMesh(m, p);
			var mat = matFor(p.c);
			if (S.stress && analysis) { var fl = analysis.floating.indexOf(p.u) >= 0; mat = stressMat(analysis.stress[p.u] || 0, fl); }
			if (vis && W.parts[stepN - 1] === p) mat = highlightMat(p.c);
			m.material = mat; m.visible = !vis || !!vis[p.u];
		});
		Object.keys(meshes).forEach(function (u) { if (!seen[u]) { scene.remove(meshes[u]); delete meshes[u]; } });
		pickList = null; dirty = true;
	}
	var HMAT = {};
	function highlightMat(c) { if (HMAT[c]) return HMAT[c]; var m = matFor(c).clone(); m.emissive = new T.Color('#ffd166'); m.emissiveIntensity = 0.45; return (HMAT[c] = m); }

	// ---------- ghost ----------
	function rebuildGhost() {
		if (!T) return;
		if (ghost) scene.remove(ghost);
		ghost = new T.Mesh(geoFor(S.part), new T.MeshStandardMaterial({ color: new T.Color(colHex(S.color)), transparent: true, opacity: 0.55, depthWrite: false, emissive: new T.Color('#ffffff'), emissiveIntensity: 0.15 }));
		ghost.visible = false; ghost.renderOrder = 2; scene.add(ghost); dirty = true;
		status(S.tool === 'build' ? 'Click to add a ' + M.BY[S.part].name + '. Shift-click removes. R turns it.' : $('bb-status').textContent);
	}
	function updateGhostMat() { if (ghost) { ghost.material.color.set(colHex(S.color)); dirty = true; } }

	// ---------- pointer: where would the brick go? ----------
	var ray, ndc, hover = null;
	function picks() {
		if (pickList) return pickList;
		pickList = baseGroup.children.slice();
		W.parts.forEach(function (p) { var m = meshes[p.u]; if (m && m.visible) pickList.push(m); });
		return pickList;
	}
	function hitAt(ev) {
		var r = renderer.domElement.getBoundingClientRect();
		ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
		ray.setFromCamera(ndc, camera);
		var h = ray.intersectObjects(picks(), false)[0]; if (!h) return null;
		var n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new T.Vector3(0, 1, 0), pt = h.point;
		if (h.object.userData.base) return { cx: Math.floor(pt.x / PX), cz: Math.floor(pt.z / PX), y: 0, u: 0, n: new T.Vector3(0, 1, 0) };
		var p = W.byU[h.object.userData.u], d = M.BY[p.t], top = (p.y + d.h) * PY;
		if (n.y > 0.5 || pt.y >= top - 0.05) return { cx: Math.floor(pt.x / PX), cz: Math.floor(pt.z / PX), y: Math.floor((pt.y + 0.3) / PY), u: p.u, n: new T.Vector3(0, 1, 0) };
		if (n.y < -0.5) return { cx: Math.floor(pt.x / PX), cz: Math.floor(pt.z / PX), y: Math.round(pt.y / PY), under: true, u: p.u, n: n };
		return { cx: Math.floor((pt.x + n.x * 4) / PX), cz: Math.floor((pt.z + n.z * 4) / PX), y: Math.max(0, Math.floor((pt.y - 0.05) / PY)), u: p.u, n: n, side: true };
	}
	function spot(h) {
		var d = M.BY[S.part], sz = M.size(d, S.rot), x0, z0;
		x0 = h.side && h.n.x > 0.5 ? h.cx : h.side && h.n.x < -0.5 ? h.cx - sz[0] + 1 : h.cx - Math.floor((sz[0] - 1) / 2);
		z0 = h.side && h.n.z > 0.5 ? h.cz : h.side && h.n.z < -0.5 ? h.cz - sz[1] + 1 : h.cz - Math.floor((sz[1] - 1) / 2);
		x0 = Math.max(0, Math.min(W.size - sz[0], x0)); z0 = Math.max(0, Math.min(W.size - sz[1], z0));
		var want = h.under ? h.y - d.h : h.side ? h.y - Math.max(0, d.h - 1) : h.y;
		if (h.side) { var y1 = W.placeY(S.part, S.rot, x0, z0, h.y); if (y1 === h.y) return { x: x0, z: z0, y: y1 }; }
		return { x: x0, z: z0, y: W.placeY(S.part, S.rot, x0, z0, want) };
	}
	function showGhost(ev) {
		if (!ghost) return;
		if (S.tool !== 'build' || stepN != null || !S.ghost || ev.pointerType === 'touch' || (crash && crash.active())) { if (ghost.visible) { ghost.visible = false; dirty = true; } hover = null; return; }
		var h = hitAt(ev); if (!h) { ghost.visible = false; dirty = true; hover = null; return; }
		var s = spot(h); hover = s;
		placeMesh(ghost, { t: S.part, x: s.x, y: s.y, z: s.z, r: S.rot }); ghost.visible = true; dirty = true;
		var hh = (s.y * PY / 10).toFixed(1);
		$('bb-chip').textContent = M.BY[S.part].name + ' · stud ' + s.x + ', ' + s.z + ' · ' + hh + ' cm up';
	}
	function clickAt(ev) {
		if (crash && crash.active()) return;
		var h = hitAt(ev);
		if (stepN != null) { toast('Showing building steps. Press "Show all" to build again.'); return; }
		if (S.tool === 'build' && !ev.shiftKey) {
			if (!h) return;
			var s = spot(h);
			if (!W.fits({ u: -1, t: S.part, x: s.x, y: s.y, z: s.z, r: S.rot })) return toast('That spot is taken.');
			W.add({ t: S.part, x: s.x, y: s.y, z: s.z, r: S.rot, c: S.color });
			if (s.y > 300) toast('That is very high!');
			commit(); showGhost(ev); return;
		}
		if (!h || !h.u) return;
		var q = W.byU[h.u];
		if (fixed[q.u] && S.tool !== 'pick' && S.tool !== 'load') return toast('That part belongs to the challenge and cannot be changed.');
		if (S.tool === 'remove' || (S.tool === 'build' && ev.shiftKey)) { W.remove(q.u); delete loads[q.u]; if (testU === q.u) testU = 0; commit(); return; }
		if (S.tool === 'paint') { if (q.c === S.color) return; q.c = S.color; commit(); return; }
		if (S.tool === 'pick') { S.part = q.t; S.color = q.c; S.rot = q.r; S.cat = M.BY[q.t].cat; saveS(); drawParts(); setTool('build'); rebuildGhost(); toast('Picked ' + partLabel(q)); return; }
		if (S.tool === 'load') { testU = q.u; if (loads[q.u]) delete loads[q.u]; else loads[q.u] = S.lw; commit(); return; }
	}
	function pointerSetup() {
		ray = new T.Raycaster(); ndc = new T.Vector2();
		var el = renderer.domElement, down = null;
		el.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY, b: e.button, t: Date.now(), touches: 1 }; view.focus({ preventScroll: true }); });
		el.addEventListener('pointermove', function (e) { if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) down.moved = true; if (!down) showGhost(e); else if (!down.moved) showGhost(e); });
		el.addEventListener('pointerleave', function () { if (ghost) { ghost.visible = false; dirty = true; } $('bb-chip').textContent = ''; });
		el.addEventListener('pointerup', function (e) {
			var d = down; down = null; if (!d || d.moved || d.b !== 0) return;
			if (e.pointerType === 'touch' && Date.now() - d.t > 650) return;
			clickAt(e);
		});
		el.addEventListener('pointercancel', function () { down = null; });
		el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
	}

	// ---------- camera ----------
	function bounds() {
		var b = new T.Box3();
		W.parts.forEach(function (p) { var d = M.BY[p.t], sz = M.size(d, p.r); b.expandByPoint(new T.Vector3(p.x * PX, p.y * PY, p.z * PX)); b.expandByPoint(new T.Vector3((p.x + sz[0]) * PX, (p.y + d.h) * PY, (p.z + sz[1]) * PX)); });
		if (b.isEmpty()) b.set(new T.Vector3(0, 0, 0), new T.Vector3(S.size * PX, 40, S.size * PX));
		return b;
	}
	function setView(v, instant) {
		var b = v === 'fit' ? bounds() : (function () { var bb = bounds(), L = S.size * PX; bb.expandByPoint(new T.Vector3(0, 0, 0)); bb.expandByPoint(new T.Vector3(L, 0, L)); return bb; })();
		var c = b.getCenter(new T.Vector3()), r = b.getSize(new T.Vector3()).length() / 2, dist = r / Math.sin(camera.fov * Math.PI / 360) * 0.95;
		var dir = v === 'top' ? new T.Vector3(0, 1, 0.0001) : v === 'front' ? new T.Vector3(0, 0.12, 1) : v === 'side' ? new T.Vector3(1, 0.12, 0) : new T.Vector3(0.75, 0.75, 1.05);
		if (v === 'fit') dir = camera.position.clone().sub(orbit.target).normalize();
		camera.position.copy(c).add(dir.normalize().multiplyScalar(Math.max(60, dist)));
		orbit.target.copy(c); orbit.update(); dirty = true;
	}

	// ---------- labels for weights ----------
	function drawLabels() {
		var box = $('bb-labels'), html = '', w = view.clientWidth, h = view.clientHeight, v = new T.Vector3();
		Object.keys(loads).forEach(function (u) {
			var p = W.byU[u]; if (!p) return; var d = M.BY[p.t], sz = M.size(d, p.r);
			if (stepN != null && W.parts.indexOf(p) >= stepN) return;
			v.set((p.x + sz[0] / 2) * PX, (p.y + d.h) * PY + 3, (p.z + sz[1] / 2) * PX).project(camera);
			if (v.z > 1) return;
			html += '<span class="bb-wt" style="left:' + ((v.x + 1) / 2 * w).toFixed(0) + 'px;top:' + ((1 - v.y) / 2 * h).toFixed(0) + 'px">⚖ ' + esc(M.fmtG(loads[u])) + '</span>';
		});
		if (testU && W.byU[testU] && !loads[testU]) {
			var p = W.byU[testU], d = M.BY[p.t], sz = M.size(d, p.r);
			v.set((p.x + sz[0] / 2) * PX, (p.y + d.h) * PY + 3, (p.z + sz[1] / 2) * PX).project(camera);
			if (v.z <= 1) html += '<span class="bb-wt bb-wt--t" style="left:' + ((v.x + 1) / 2 * w).toFixed(0) + 'px;top:' + ((1 - v.y) / 2 * h).toFixed(0) + 'px">test here</span>';
		}
		if (box._h !== html) { box.innerHTML = html; box._h = html; }
	}
	var stepPulse = 0;
	function loop(t) {
		requestAnimationFrame(loop);
		if (document.hidden) return;
		if (crash && crash.frame(t)) dirty = true;
		if (stepN != null && W.parts[stepN - 1]) { var m = meshes[W.parts[stepN - 1].u]; if (m) { m.material.emissiveIntensity = 0.25 + 0.25 * Math.sin(t / 220); dirty = true; } }
		if (!dirty) return; dirty = false;
		renderer.render(scene, camera); drawLabels();
	}

	// ---------- refresh everything after a change ----------
	function opts() { return { anchored: S.anchored, clutch: M.CLUTCH[S.grip], loads: loads }; }
	function refresh() {
		analysis = M.analyze(W, opts());
		if (T) sync();
		$('bb-empty').hidden = W.parts.length > 0 || !T;
		drawResults(); drawSteps(); drawBom(); drawChallenge();
		root.querySelector('[data-act=undo]').disabled = !hist.length; root.querySelector('[data-act=redo]').disabled = !fut.length;
	}
	function drawResults() {
		var a = analysis, st = M.stats(W), n = W.parts.length, wt = 0; Object.keys(loads).forEach(function (u) { wt += loads[u]; });
		var weak = a.weakest && W.byU[a.weakest], pct = a.max === Infinity ? '∞' : Math.round(a.max * 100) + '%';
		var why = { overhang: 'sticks out too far for its studs', bending: 'bends too much over its gap', hanging: 'hangs from its studs' };
		var verdict = !n ? '' : a.tips ? '<div class="bb-bad">⚠ The whole build tips over (its weight is not over where it touches the ground).</div>'
			: a.max >= 1 ? '<div class="bb-bad">⚠ Something breaks: ' + esc(partLabel(weak)) + ' ' + esc(why[a.why[a.weakest]] || '') + ' (' + pct + ').</div>'
			: a.floating.length ? '' : '<div class="bb-good">✓ It stands' + (wt ? ' and holds its weights' : '') + '.</div>';
		$('bb-res').innerHTML = (n ? '<table class="bb-kv">' +
			'<tr><th>Parts</th><td>' + n + '</td></tr>' +
			'<tr><th>Separate pieces</th><td>' + a.groups + (a.groups > 1 ? ' <span class="bb-dim">(not joined to each other)</span>' : '') + '</td></tr>' +
			(a.floating.length ? '<tr><th>Floating</th><td class="bb-badt">' + a.floating.length + ' part' + (a.floating.length > 1 ? 's' : '') + ' not joined to the ground (pink)</td></tr>' : '') +
			'<tr><th>Size</th><td>' + st.wide + ' x ' + st.deep + ' studs, ' + (st.heightMm / 10).toFixed(1) + ' cm tall</td></tr>' +
			'<tr><th>Weight</th><td>' + M.fmtG(st.mass) + ' of bricks' + (wt ? ' + ' + M.fmtG(wt) + ' on top' : '') + '</td></tr>' +
			(weak ? '<tr><th>Hardest working</th><td>' + esc(partLabel(weak)) + ': ' + pct + '</td></tr>' : '') +
			'</table>' : '<p class="bb-small">Add some bricks to test them.</p>') + verdict;
		var tp = testU && W.byU[testU];
		$('bb-btest').innerHTML = tp ? 'Testing: <b>' + esc(partLabel(tp)) + '</b>' + (loads[testU] ? ' (carrying ' + esc(M.fmtG(loads[testU])) + ')' : '') : 'Click a brick with the ⚖ Weight tool, then find out how much it can hold.';
	}
	function breakTest() {
		var u = testU;
		if (!u || !W.byU[u]) {
			// pick the highest part near the middle of the build
			var b = M.stats(W); if (!W.parts.length) return toast('Build something first.');
			var cx = 0, cz = 0; W.parts.forEach(function (p) { cx += p.x; cz += p.z; }); cx /= W.parts.length; cz /= W.parts.length;
			var best = null; W.parts.forEach(function (p) { var s = (p.y + M.BY[p.t].h) * 2 - Math.hypot(p.x - cx, p.z - cz); if (!best || s > best[0]) best = [s, p.u]; });
			u = testU = best[1];
		}
		var L = {}; for (var k in loads) if (+k !== u) L[k] = loads[k];
		var r = M.breakLoad(W, u, { anchored: S.anchored, clutch: M.CLUTCH[S.grip], loads: L });
		var p = W.byU[u], wk = r.weakest && W.byU[r.weakest], why = { overhang: 'it sticks out too far for its studs', bending: 'it bends too much', hanging: 'it pulls off its studs', 'tips over': 'the whole build tips over' };
		var msg = r.g === 0 ? 'It already fails without any extra weight.' : !isFinite(r.g) ? 'It holds more than 50 kg here (in this model). Arches and parts resting flat on others mostly get squeezed, not bent.' : 'It can hold about <b>' + esc(M.fmtG(r.g)) + '</b> on the ' + esc(partLabel(p)) + '.';
		if (wk || r.why === 'tips over') msg += ' Then ' + (r.why === 'tips over' ? 'the whole build tips over.' : 'the ' + esc(partLabel(wk)) + ' gives up: ' + esc(why[r.why] || r.why) + '.');
		$('bb-bres').innerHTML = msg;
		drawResults(); dirty = true;
	}

	// ---------- steps ----------
	var playT = null;
	function drawSteps() {
		var n = W.parts.length, r = $('bb-step'); r.max = n; r.value = stepN == null ? n : stepN;
		var now = $('bb-stepnow');
		if (stepN == null) now.innerHTML = n ? '<b>' + n + ' steps.</b> Press Next or move the slider to build it one part at a time.' : 'No parts yet.';
		else if (!stepN) now.innerHTML = 'Step 0 of ' + n + ': an empty baseplate.';
		else { var p = W.parts[stepN - 1], sz = M.size(M.BY[p.t], p.r); now.innerHTML = '<span class="bb-swd" style="background:' + colHex(p.c) + '"></span><b>Step ' + stepN + ' of ' + n + ':</b> add a ' + esc(partLabel(p)) + (p.y ? ', ' + (p.y % 3 === 0 ? (p.y / 3) + ' brick' + (p.y / 3 === 1 ? '' : 's') : p.y + ' plates') + ' up' : ' on the baseplate') + '.'; }
	}
	function setStep(v) {
		stepN = v == null || v >= W.parts.length ? (v == null ? null : W.parts.length) : Math.max(0, v);
		if (v == null) stepN = null;
		if (stepN != null && ghost) ghost.visible = false;
		root.classList.toggle('bb-stepping', stepN != null);
		sync(); drawSteps();
	}
	function play() {
		if (playT) { clearInterval(playT); playT = null; $('bb-splay').textContent = '▶ Play'; return; }
		if (stepN == null || stepN >= W.parts.length) setStep(0);
		$('bb-splay').textContent = '❚❚ Pause';
		playT = setInterval(function () { if (stepN >= W.parts.length) { play(); return; } setStep(stepN + 1); }, Math.max(120, Math.min(700, 12000 / Math.max(1, W.parts.length))));
	}

	// ---------- parts list ----------
	function drawBom() {
		var b = M.bom(W.list()), st = M.stats(W);
		$('bb-sum').innerHTML = W.parts.length ? '<b>' + W.parts.length + ' parts</b>, ' + b.length + ' different kinds. ' + (st.heightMm / 10).toFixed(1) + ' cm tall.' : 'No parts yet.';
		$('bb-bom').innerHTML = b.length ? '<table class="bb-bomt"><thead><tr><th></th><th>Part</th><th>Colour</th><th>How many</th></tr></thead><tbody>' + b.map(function (r) { return '<tr><td><span class="bb-swd" style="background:' + colHex(r.c) + '"></span></td><td>' + esc(r.name) + '</td><td>' + esc(r.color) + '</td><td>' + r.n + '</td></tr>'; }).join('') + '</tbody></table>' : '';
	}
	function bomText(sep) { return ['Part', 'Colour', 'How many'].join(sep) + '\n' + M.bom(W.list()).map(function (r) { return [r.name, r.color, r.n].join(sep); }).join('\n'); }

	// ---------- challenges ----------
	function drawChallenge() {
		var box = $('bb-chal');
		if (!chal) { box.innerHTML = ''; return; }
		box.innerHTML = '<div class="bb-cbox"><b>' + esc(chal.emoji + ' ' + chal.name.replace('Challenge: ', '')) + '</b><p>' + esc(chal.desc) + '</p><div class="bb-btns"><button type="button" class="bb-b bb-b--pri" id="bb-ccheck">Check my build</button> <button type="button" class="bb-b" id="bb-cquit">Leave the challenge</button></div><div id="bb-cres" aria-live="polite"></div></div>';
		$('bb-ccheck').onclick = checkChallenge;
		$('bb-cquit').onclick = function () { chal = null; fixed = {}; lastSnap = snap(); persist(); refresh(); };
	}
	function checkChallenge() {
		var c = chal.challenge, out = $('bb-cres'), added = W.parts.filter(function (p) { return !fixed[p.u]; });
		function say(okk, msg) { out.innerHTML = '<p class="' + (okk ? 'bb-good' : 'bb-bad') + '">' + msg + '</p>'; if (okk) toast('🎉 Challenge done!', 4000); }
		if (!added.length) return say(false, 'Add some parts first.');
		var gs = M.groups(W);
		if (c.kind === 'span') {
			var left = W.parts.filter(function (p) { return fixed[p.u] && p.x + M.size(M.BY[p.t], p.r)[0] - 1 <= c.from && p.x <= c.from; }), right = W.parts.filter(function (p) { return fixed[p.u] && p.x >= c.to; });
			var joined = gs.some(function (g) { return g.parts.some(function (u) { return left.some(function (p) { return p.u === u; }); }) && g.parts.some(function (u) { return right.some(function (p) { return p.u === u; }); }); });
			if (!joined) return say(false, 'The bridge does not join the two banks yet. It must touch the grey stone on both sides.');
			var mid = null; added.forEach(function (p) { var sz = M.size(M.BY[p.t], p.r); if (c.mid[0] >= p.x && c.mid[0] < p.x + sz[0] && c.mid[1] >= p.z && c.mid[1] < p.z + sz[1] && (!mid || p.y > mid.y)) mid = p; });
			if (!mid) return say(false, 'Put the bridge deck over the middle of the river (stud ' + c.mid[0] + ', ' + c.mid[1] + ').');
			var r = M.breakLoad(W, mid.u, opts());
			testU = mid.u;
			return say(r.g >= c.need, r.g >= c.need ? 'Yes! Your bridge holds ' + esc(M.fmtG(r.g)) + ' in the middle (it needed ' + M.fmtG(c.need) + ').' : 'It joins the banks, but holds only ' + esc(M.fmtG(r.g)) + ' in the middle. It needs ' + M.fmtG(c.need) + '. Tip: a deeper deck (plates stacked on top of each other) bends much less.');
		}
		if (c.kind === 'reach') {
			if (added.some(function (p) { return p.y === 0; })) return say(false, 'No propping it up from the ground: only the wall may hold your arm.');
			var wallG = gs.filter(function (g) { return g.parts.some(function (u) { return fixed[u] && W.byU[u].t !== 't1x2'; }); })[0];
			var far = null; added.forEach(function (p) { if (wallG && wallG.parts.indexOf(p.u) < 0) return; var e = p.x + M.size(M.BY[p.t], p.r)[0] - 1; if (!far || e > far[0]) far = [e, p]; });
			if (!far) return say(false, 'Your parts are not joined to the wall.');
			if (far[0] < c.x) return say(false, 'It reaches stud ' + far[0] + '. Keep going until it passes the red line at stud ' + c.x + '.');
			var r2 = M.breakLoad(W, far[1].u, opts()); testU = far[1].u;
			return say(r2.g >= c.need, r2.g >= c.need ? 'Yes! It reaches past the line and holds ' + esc(M.fmtG(r2.g)) + ' at the end.' : 'It reaches the line, but its end holds only ' + esc(M.fmtG(r2.g)) + ' (needs ' + M.fmtG(c.need) + '). Tip: weight on the back of the wall side, or more studs where it joins, helps.');
		}
	}

	// ---------- examples dialog ----------
	var thumbs = {}, thumbR = null;
	function thumbFor(e) {
		if (thumbs[e.id] || !T) return thumbs[e.id] || '';
		try {
			if (!thumbR) { thumbR = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); thumbR.setSize(240, 170); thumbR.setPixelRatio(1); }
			var sc = new T.Scene(); sc.background = new T.Color('#dbe9f6'); sc.add(new T.HemisphereLight(0xffffff, 0x8a8f99, 1.6)); var dl = new T.DirectionalLight(0xffffff, 1.8); dl.position.set(200, 400, 300); sc.add(dl);
			var m = e.make(), b = new T.Box3();
			m.parts.forEach(function (p) { var me = new T.Mesh(geoFor(p.t), matFor(p.c)); placeMesh(me, p); sc.add(me); b.expandByObject(me); });
			var cam = new T.PerspectiveCamera(32, 240 / 170, 1, 5000), c = b.getCenter(new T.Vector3()), r = b.getSize(new T.Vector3()).length() / 2;
			cam.position.copy(c).add(new T.Vector3(0.8, 0.62, 1).normalize().multiplyScalar(r / Math.sin(16 * Math.PI / 180) * 0.9)); cam.lookAt(c);
			thumbR.render(sc, cam); thumbs[e.id] = thumbR.domElement.toDataURL('image/png');
		} catch (er) { thumbs[e.id] = ''; }
		return thumbs[e.id];
	}
	function dialog(html, cls) {
		var w = $('bb-dlgw'), d = $('bb-dlg'); d.className = 'bb-dlg ' + (cls || ''); d.innerHTML = '<button type="button" class="bb-x" aria-label="Close" data-close>✕</button>' + html; w.hidden = false;
		var f = d.querySelector('button:not([data-close]), input'); (f || d.querySelector('[data-close]')).focus();
	}
	function closeDlg() { $('bb-dlgw').hidden = true; view.focus({ preventScroll: true }); }
	function examplesDlg(cat) {
		cat = cat || examplesDlg.cat || 'kids'; examplesDlg.cat = cat;
		var tabs = [['kids', 'For kids'], ['eng', 'Bridges & engineering'], ['chal', 'Challenges']];
		dialog('<h3>Example builds</h3><div class="bb-etabs" role="tablist">' + tabs.map(function (t) { return '<button type="button" class="bb-cat" role="tab" data-ecat="' + t[0] + '" aria-selected="' + (t[0] === cat) + '">' + t[1] + '</button>'; }).join('') + '</div><div class="bb-egrid" id="bb-egrid">' +
			EX.filter(function (e) { return e.cat === cat; }).map(function (e) { var n = e.make().parts.length; return '<button type="button" class="bb-ex" data-ex="' + e.id + '"><span class="bb-exi"><img alt="" data-thumb="' + e.id + '" width="240" height="170"></span><b>' + esc(e.emoji + ' ' + e.name) + '</b><span class="bb-small">' + esc(e.desc) + '</span><span class="bb-dim">' + n + ' parts</span></button>'; }).join('') + '</div>', 'bb-dlg--wide');
		var imgs = Array.prototype.slice.call($('bb-egrid').querySelectorAll('img[data-thumb]')), i = 0;
		(function next() { if (i >= imgs.length || $('bb-dlgw').hidden) return; var im = imgs[i++], e = EX.filter(function (x) { return x.id === im.dataset.thumb; })[0]; im.src = thumbFor(e) || 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; setTimeout(next, 10); })();
	}
	function loadExample(id) {
		var e = EX.filter(function (x) { return x.id === id; })[0]; if (!e) return;
		var m = e.make();
		hist.push(lastSnap); fut = [];
		if (S.size < 32) setSize(32, true);
		W.load(m.parts); loads = {}; fixed = {}; testU = 0;
		(m.loads || []).forEach(function (x) { if (W.parts[x[0]]) loads[W.parts[x[0]].u] = x[1]; });
		if (m.test != null && W.parts[m.test]) testU = W.parts[m.test].u;
		if (m.fixed) W.parts.forEach(function (p) { fixed[p.u] = 1; });
		chal = e.challenge ? e : null;
		S.anchored = m.anchored !== false; S.grip = m.grip || 'normal'; syncControls();
		$('bb-bres').textContent = '';
		stepN = null; root.classList.remove('bb-stepping');
		lastSnap = snap(); persist(); refresh(); closeDlg();
		if (T) setView('fit');
		if (e.cat === 'eng' || e.cat === 'chal') { tab('test'); if (e.cat === 'eng') { S.stress = true; syncControls(); refresh(); } }
		toast(e.emoji + ' ' + e.name + ' (' + W.parts.length + ' parts)');
	}

	// ---------- files / links ----------
	function fileObj() { return { app: 'mes-brick-builder', v: 1, size: S.size, parts: W.list(), loads: loadList(), anchored: S.anchored, grip: S.grip }; }
	function download(name, blob) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }
	function openObj(o) {
		if (!o || !Array.isArray(o.parts)) throw new Error('not a Brick Builder file');
		var list = M.decode(M.encode(o.parts.filter(function (p) { return p && M.BY[p.t]; })));
		hist.push(lastSnap); fut = [];
		if ([16, 32, 48].indexOf(o.size) >= 0) setSize(o.size, true);
		W.load(list); loads = {}; fixed = {}; chal = null; testU = 0;
		(o.loads || []).forEach(function (x) { if (W.parts[x[0]] && +x[1] > 0) loads[W.parts[x[0]].u] = Math.min(100000, +x[1]); });
		if (o.anchored != null) S.anchored = !!o.anchored; if (M.CLUTCH[o.grip] != null) S.grip = o.grip; syncControls();
		lastSnap = snap(); persist(); refresh(); if (T) setView('fit');
	}
	function b64u(bytes) { var s = ''; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
	function unb64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
	function linkCode() {
		var txt = M.encode(W.list()) + '|' + S.size + '|' + loadList().map(function (x) { return x.join(':'); }).join(',') + '|' + (S.anchored ? 1 : 0) + { normal: 'n', strong: 's', none: 'o' }[S.grip];
		var raw = new TextEncoder().encode(txt);
		if (typeof CompressionStream === 'undefined') return Promise.resolve('p' + b64u(raw));
		var cs = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
		return new Response(cs).arrayBuffer().then(function (ab) { return 'z' + b64u(new Uint8Array(ab)); });
	}
	function readLink(code) {
		var bytes = unb64u(code.slice(1));
		var p = code.charAt(0) === 'z' ? new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text() : Promise.resolve(new TextDecoder().decode(bytes));
		return p.then(function (txt) {
			var f = txt.split('|'), list = M.decode(f[0]); if (!list) throw new Error('bad link');
			var o = { parts: list, size: +f[1] || 32, loads: (f[2] || '').split(',').filter(Boolean).map(function (x) { return x.split(':').map(Number); }) };
			if (f[3]) { o.anchored = f[3].charAt(0) === '1'; o.grip = { n: 'normal', s: 'strong', o: 'none' }[f[3].charAt(1)] || 'normal'; }
			return o;
		});
	}
	function share() {
		if (!W.parts.length) return toast('Build something first.');
		linkCode().then(function (code) {
			var url = location.origin + location.pathname + '#b=' + code;
			if (url.length > 60000) return toast('This build is too big for a link. Use Save instead.', 4000);
			var done = function () { toast('Link copied (' + W.parts.length + ' parts inside it).'); };
			if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt('Copy this link:', url); });
			else prompt('Copy this link:', url);
		});
	}
	function setSize(n, quiet) {
		var too = W.parts.some(function (p) { var sz = M.size(M.BY[p.t], p.r); return p.x + sz[0] > n || p.z + sz[1] > n; });
		if (too && !quiet) { toast('Some parts are outside a ' + n + ' x ' + n + ' baseplate. Remove them first.', 4000); $('bb-size').value = S.size; return; }
		S.size = n; saveS(); var list = W.list(), L = loadList(), F = snap().f; W = new M.World(n); W.load(list);
		loads = {}; L.forEach(function (x) { if (W.parts[x[0]]) loads[W.parts[x[0]].u] = x[1]; }); fixed = {}; if (F) F.forEach(function (v, i) { if (v && W.parts[i]) fixed[W.parts[i].u] = 1; });
		if (T) { buildBase(); if (!quiet) setView('iso'); }
		if (!quiet) { lastSnap = snap(); persist(); refresh(); }
	}

	// ---------- picture / STL ----------
	function shot() {
		if (!T) return; ghost && (ghost.visible = false);
		renderer.render(scene, camera);
		renderer.domElement.toBlob(function (b) { if (b) download('brick-build.png', b); });
	}
	function stl() {
		if (!W.parts.length) return toast('Build something first.');
		imp('three/addons/exporters/STLExporter.js').then(function (mod) {
			var g = new T.Group(); W.parts.forEach(function (p) { var m = new T.Mesh(geoFor(p.t)); placeMesh(m, p); g.add(m); });
			g.updateMatrixWorld(true);
			var data = new mod.STLExporter().parse(g, { binary: true });
			download('brick-build.stl', new Blob([data], { type: 'model/stl' })); toast('STL saved (millimetres).');
		}).catch(function (e) { toast('Could not load the STL exporter: ' + e.message); });
	}

	// ---------- fill window / full screen ----------
	function fill(on) {
		on = on == null ? !root.classList.contains('bb-fill') : on;
		root.classList.toggle('bb-fill', on); document.documentElement.classList.toggle('bb-fill-on', on);
		$('bb-fillbtn').setAttribute('aria-pressed', on ? 'true' : 'false'); $('bb-fillbtn').textContent = on ? '✕ Close' : '⤢ Fill window';
		setTimeout(resize, 30);
	}
	function full() {
		var fe = document.fullscreenElement || document.webkitFullscreenElement;
		if (fe) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
		var rq = root.requestFullscreen || root.webkitRequestFullscreen; if (!rq) return fill(true);
		fill(true); rq.call(root);
	}
	document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && root.classList.contains('bb-fill') && fill._fs) fill(false); fill._fs = !!document.fullscreenElement; setTimeout(resize, 50); });

	// ---------- help ----------
	function help() {
		dialog('<h3>How to use the Brick Builder</h3><ul class="bb-help">' +
			'<li><b>Build:</b> pick a part and colour, then click. Bricks drop onto what is under them; click the side of a brick to build next to it, or under an overhang to hang a part below it.</li>' +
			'<li><b>Look around:</b> drag to turn, right-drag (or two fingers) to move, scroll or pinch to zoom. Views: 3D, Top, Front, Side, Fit.</li>' +
			'<li><b>Strength:</b> turn on stress colours, put weights on with ⚖ Weight and press Find the breaking load.</li>' +
			'<li><b>Steps:</b> the Steps tab shows the build one part at a time, like instructions.</li></ul>' +
			'<table class="bb-kv"><tr><th>R</th><td>Turn the brick</td></tr><tr><th>B P X I W</th><td>Build, Paint, Remove, Pick, Weight</td></tr><tr><th>Shift-click</th><td>Remove a brick</td></tr><tr><th>Ctrl+Z / Ctrl+Y</th><td>Undo / redo</td></tr><tr><th>[ ]</th><td>Previous / next colour</td></tr><tr><th>0 7 1 3 .</th><td>3D, top, front, side, fit</td></tr><tr><th>F / Shift+F</th><td>Fill window / full screen</td></tr><tr><th>← →</th><td>Previous / next step (Steps tab)</td></tr></table>');
	}

	// ---------- controls ----------
	function tab(t) {
		S.tab = t; saveS();
		Array.prototype.forEach.call(root.querySelectorAll('.bb-tab'), function (b) { b.setAttribute('aria-selected', b.dataset.tab === t ? 'true' : 'false'); });
		['test', 'steps', 'list', 'set', 'crash'].forEach(function (x) { $('bb-tp-' + x).hidden = x !== t; });
		if (t !== 'steps' && stepN != null) { if (playT) play(); setStep(null); }
		if (t === 'crash') { wantCrash = true; if (crash && !crash.active()) crash.enter(); }
		else { wantCrash = false; if (crash && crash.active()) crash.exit(); }
	}
	function syncControls() {
		$('bb-stress').checked = S.stress; $('bb-anch').checked = S.anchored; $('bb-grip').value = S.grip; $('bb-lw').value = String(S.lw);
		$('bb-size').value = String(S.size); $('bb-bcol').value = String(S.bcol); $('bb-shadow').checked = S.shadow; $('bb-ghost').checked = S.ghost; $('bb-studs').checked = S.studs;
		saveS();
	}
	function wire() {
		root.querySelector('.bb-bar').addEventListener('click', function (e) {
			var b = e.target.closest('[data-act],[data-tool]'); if (!b) return;
			if (b.dataset.tool) return setTool(b.dataset.tool);
			act(b.dataset.act);
		});
		$('bb-empty').addEventListener('click', function (e) { if (e.target.closest('[data-act=examples]')) examplesDlg(); });
		root.querySelector('.bb-vtools').addEventListener('click', function (e) { var b = e.target.closest('[data-view]'); if (b && T) setView(b.dataset.view); });
		root.querySelector('.bb-tabs').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) tab(b.dataset.tab); });
		$('bb-stress').onchange = function () { S.stress = this.checked; saveS(); sync(); };
		$('bb-anch').onchange = function () { S.anchored = this.checked; saveS(); refresh(); };
		$('bb-grip').onchange = function () { S.grip = this.value; saveS(); refresh(); };
		$('bb-lw').onchange = function () { S.lw = +this.value; saveS(); if (S.tool === 'load') setTool('load'); };
		$('bb-break').onclick = breakTest;
		$('bb-clearw').onclick = function () { if (!Object.keys(loads).length) return; loads = {}; commit(); };
		$('bb-step').oninput = function () { setStep(+this.value); };
		$('bb-snext').onclick = function () { setStep(stepN == null ? 1 : stepN + 1); };
		$('bb-sprev').onclick = function () { setStep(stepN == null ? W.parts.length - 1 : stepN - 1); };
		$('bb-splay').onclick = play;
		$('bb-sall').onclick = function () { if (playT) play(); setStep(null); };
		$('bb-ssort').onclick = function () { if (W.parts.length < 2) return; var s0 = snap(), order = M.sortSteps(W.parts.map(function (p, i) { return { p: p, i: i, y: p.y }; })); hist.push(lastSnap); fut = []; var nl = order.map(function (o) { return s0.p[o.i]; }), nlL = []; order.forEach(function (o, j) { var L = s0.l.filter(function (x) { return x[0] === o.i; })[0]; if (L) nlL.push([j, L[1]]); }); var f = s0.f ? order.map(function (o) { return s0.f[o.i]; }) : null; restore({ p: nl, l: nlL, f: f }); lastSnap = snap(); persist(); refresh(); toast('Steps now go from the bottom up.'); };
		$('bb-bomcopy').onclick = function () { var t = bomText('\t'); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { toast('Parts list copied.'); }, function () { prompt('Copy:', t); }); };
		$('bb-bomcsv').onclick = function () { download('brick-parts-list.csv', new Blob([bomText(',')], { type: 'text/csv' })); };
		$('bb-size').onchange = function () { setSize(+this.value); };
		$('bb-bcol').onchange = function () { S.bcol = +this.value; saveS(); if (T) buildBase(); };
		$('bb-shadow').onchange = function () { S.shadow = this.checked; saveS(); if (T) { renderer.shadowMap.enabled = S.shadow; scene.traverse(function (o) { if (o.material) o.material.needsUpdate = true; }); dirty = true; } };
		$('bb-ghost').onchange = function () { S.ghost = this.checked; saveS(); };
		$('bb-studs').onchange = function () { S.studs = this.checked; saveS(); if (T) buildBase(); };
		$('bb-file').onchange = function () { var f = this.files[0]; this.value = ''; if (!f) return; f.text().then(function (t) { openObj(JSON.parse(t)); toast('Opened ' + f.name); }).catch(function (e) { toast('Could not open it: ' + e.message, 4000); }); };
		$('bb-dlgw').addEventListener('click', function (e) {
			if (e.target === this || e.target.closest('[data-close]')) return closeDlg();
			var t = e.target.closest('[data-ecat]'); if (t) return examplesDlg(t.dataset.ecat);
			var x = e.target.closest('[data-ex]'); if (x) loadExample(x.dataset.ex);
		});
		document.addEventListener('keydown', function (e) {
			if (!$('bb-dlgw').hidden) { if (e.key === 'Escape') closeDlg(); return; }
			var tg = e.target; if (tg && (tg.tagName === 'INPUT' && tg.type !== 'checkbox' && tg.type !== 'range' || tg.tagName === 'SELECT' || tg.tagName === 'TEXTAREA' || tg.isContentEditable)) return;
			var inside = root.contains(tg) || root.classList.contains('bb-fill') || tg === document.body;
			if (!inside) return;
			var k = e.key, ctrl = e.ctrlKey || e.metaKey;
			if (ctrl && (k === 'z' || k === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
			if (ctrl && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
			if (ctrl && (k === 's' || k === 'S')) { e.preventDefault(); act('save'); return; }
			if (ctrl || e.altKey) return;
			if (k === 'Escape' && root.classList.contains('bb-fill') && !document.fullscreenElement) { fill(false); return; }
			if (crash && crash.active() && (k === ' ' || k === 'g')) { e.preventDefault(); crash.go(); return; }
			if (S.tab === 'steps' && stepN != null && (k === 'ArrowRight' || k === 'ArrowLeft')) { e.preventDefault(); setStep(stepN + (k === 'ArrowRight' ? 1 : -1)); return; }
			var map = { r: function () { act('rotate'); }, R: function () { act('rotate'); }, b: function () { setTool('build'); }, p: function () { setTool('paint'); }, x: function () { setTool('remove'); }, i: function () { setTool('pick'); }, w: function () { setTool('load'); },
				f: function () { fill(); }, F: function () { full(); }, '?': help, '[': function () { S.color = (S.color + M.COLORS.length - 1) % M.COLORS.length; saveS(); markPalette(); updateGhostMat(); }, ']': function () { S.color = (S.color + 1) % M.COLORS.length; saveS(); markPalette(); updateGhostMat(); },
				'0': function () { setView('iso'); }, '7': function () { setView('top'); }, '1': function () { setView('front'); }, '3': function () { setView('side'); }, '.': function () { setView('fit'); } };
			if (map[k] && (T || !/[0137.]/.test(k))) { e.preventDefault(); map[k](); }
		});
	}
	function act(a) {
		if (a === 'examples') examplesDlg();
		else if (a === 'new') { if (W.parts.length && !confirm('Start a new, empty build? (Undo brings it back.)')) return; hist.push(lastSnap); fut = []; W.clear(); loads = {}; fixed = {}; chal = null; testU = 0; stepN = null; root.classList.remove('bb-stepping'); lastSnap = snap(); persist(); refresh(); if (T) setView('iso'); }
		else if (a === 'open') $('bb-file').click();
		else if (a === 'save') { if (!W.parts.length) return toast('Build something first.'); download('brick-build.json', new Blob([JSON.stringify(fileObj())], { type: 'application/json' })); toast('Saved brick-build.json'); }
		else if (a === 'share') share();
		else if (a === 'undo') undo(); else if (a === 'redo') redo();
		else if (a === 'rotate') { S.rot = (S.rot + 1) & 3; saveS(); if (ghost && ghost.visible && hover) { var h = hover; placeMesh(ghost, { t: S.part, x: h.x, y: h.y, z: h.z, r: S.rot }); dirty = true; } toast('Turned: ' + ['0°', '90°', '180°', '270°'][S.rot], 900); }
		else if (a === 'shot') shot(); else if (a === 'stl') stl();
		else if (a === 'crash') { tab('crash'); if (window.innerWidth < 1100) $('bb-tp-crash').scrollIntoView({ block: 'nearest' }); }
		else if (a === 'fill') fill(); else if (a === 'full') full(); else if (a === 'help') help();
	}

	// ---------- start ----------
	function start() {
		buildPalette(); wire(); syncControls(); setTool(S.tool); if (root.dataset.start === 'crash') S.tab = 'crash'; tab(S.tab === 'steps' ? 'test' : S.tab);
		if (!(root.requestFullscreen || root.webkitRequestFullscreen)) $('bb-fsbtn').hidden = true;
		var h = /#b=([A-Za-z0-9_-]+)/.exec(location.hash), saved = null;
		try { saved = JSON.parse(localStorage.getItem(BKEY) || 'null'); } catch (e) {}
		var ready = Promise.resolve();
		if (h) ready = readLink(h[1]).then(function (o) { openObj(o); hist = []; toast('Opened a shared build (' + W.parts.length + ' parts).'); try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }).catch(function () { toast('That link could not be read.', 4000); });
		else if (saved && saved.s) { if ([16, 32, 48].indexOf(saved.size) >= 0) { S.size = saved.size; W = new M.World(S.size); } restore(saved.s); lastSnap = snap(); chal = saved.chal ? EX.filter(function (e) { return e.id === saved.chal; })[0] || null : null; }
		else if (!h) { var first = EX[0].make(); W.load(first.parts); lastSnap = snap(); }
		ready.then(function () {
			refresh();
			if (!imp) { $('bb-loading').innerHTML = '<div>This browser cannot load the 3D view.</div>'; return; }
			imp('three').then(function (t) { T = t; return Promise.all([imp('three/addons/controls/OrbitControls.js'), imp('three/addons/utils/BufferGeometryUtils.js')]); })
				.then(function (m) {
					OrbitControls = m[0].OrbitControls; BGU = m[1];
					try { initScene(); } catch (e) { $('bb-loading').innerHTML = '<div>The 3D view could not start (WebGL is off or not supported): ' + esc(e.message) + '</div>'; return; }
					$('bb-loading').hidden = true; rebuildGhost(); refresh(); setView(W.parts.length ? 'fit' : 'iso', true);
					if (window.BBCrash) crash = window.BBCrash({ T: T, M: M, S: S, scene: scene, camera: camera, orbit: orbit, geoFor: geoFor, matFor: matFor, placeMesh: placeMesh,
						world: function () { return W; }, setBuildVisible: setBuildVisible, sunTo: sunTo, dirty: function () { dirty = true; }, save: saveS });
					if (wantCrash || S.tab === 'crash') tab('crash');
				})
				.catch(function (e) { $('bb-loading').innerHTML = '<div>Could not load the 3D engine (' + esc(e.message) + '). Check the connection and reload.</div>'; });
		});
	}
	window.MESBrickBuilder = { crash: function () { return crash; }, world: function () { return W; }, loadExample: loadExample, analysis: function () { return analysis; }, render: function () { dirty = true; if (renderer) renderer.render(scene, camera); }, setView: function (v) { setView(v); } };
	start();
})();
