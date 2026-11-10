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
