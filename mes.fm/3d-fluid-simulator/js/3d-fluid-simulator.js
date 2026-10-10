/* MES 3D Fluid Simulator -- solver (pure JS, browser + node: require('./tool_apps_src/3d-fluid-simulator/lib.js')).
 *
 * Incompressible flow in a 3D box ("stable fluids", Stam 1999): semi-Lagrangian advection, vorticity confinement, buoyancy, and a pressure projection
 * (red-black SOR) that keeps the flow divergence-free. Units: length = one cell, time = one step, velocity = cells per step. There is no explicit
 * viscosity: the numerical diffusion of the scheme plays that role (so no Reynolds-number slider here, unlike the 2D simulator).
 * Cell types: 0 fluid, 1 solid wall / obstacle (no slip, Neumann pressure), 2 outflow (p = 0, velocity copied), 3 inflow (fixed velocity, smoke rake).
 * y is up. Index = x + nx * (y + ny * z). The outermost layer of cells is the boundary, so the fluid lives in 1..n-2.
 * Fields: u v w (velocity), T (temperature), s (smoke density), c (a "colour tag" that rides with the smoke: which source / height it came from).
 */
(function (root) {
	"use strict";

	function Fluid3(nx, ny, nz) {
		this.nx = nx; this.ny = ny; this.nz = nz; this.sy = nx; this.sz = nx * ny;
		var N = this.N = nx * ny * nz;
		function A() { return new Float32Array(N); }
		this.u = A(); this.v = A(); this.w = A(); this.T = A(); this.s = A(); this.c = A();
		this.q = A(); this.div = A();
		this.o = [A(), A(), A(), A(), A(), A()];            // advection output buffers
		this.wx = A(); this.wy = A(); this.wz = A(); this.wm = A();   // vorticity scratch
		this.type = new Uint8Array(N); this.obst = new Uint8Array(N);
		this.nb = new Uint8Array(N); this.cnt = new Uint8Array(N);
		this.mode = "box";            // box | opentop | tunnel
		this.U = 1.0;                 // inflow speed (tunnel)
		this.beta = 0.0;              // buoyancy: v += beta * T per step
		this.vort = 0.0;              // vorticity confinement strength
		this.fade = 0.0; this.cool = 0.004;
		this.iters = 20; this.omega = 1.7;
		this.rake = true;
		this.heaters = [];            // {x, y, z, r, T, s, c}
		this.pulses = [];             // smoke-ring cannons, see fire()
		this.time = 0; this.steps = 0;
		this.rebuild();
	}

	Fluid3.prototype.rebuild = function () {
		var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz, x, y, z, k, m = this.mode;
		for (z = 0; z < nz; z++) for (y = 0; y < ny; y++) for (x = 0; x < nx; x++) {
			k = x + sy * y + sz * z; var edge = x === 0 || y === 0 || z === 0 || x === nx - 1 || y === ny - 1 || z === nz - 1, t = 0;
			if (edge) {
				t = 1;
				if (m === "opentop" && y === ny - 1 && x > 0 && x < nx - 1 && z > 0 && z < nz - 1) t = 2;
				if (m === "tunnel") { if (x === 0 && y > 0 && y < ny - 1 && z > 0 && z < nz - 1) t = 3; else if (x === nx - 1 && y > 0 && y < ny - 1 && z > 0 && z < nz - 1) t = 2; }
			} else if (this.obst[k]) t = 1;
			this.type[k] = t;
		}
		for (z = 1; z < nz - 1; z++) for (y = 1; y < ny - 1; y++) for (x = 1; x < nx - 1; x++) {
			k = x + sy * y + sz * z; if (this.type[k] !== 0) { this.nb[k] = 0; this.cnt[k] = 0; continue; }
			var bits = 0, c = 0, tt;
			tt = this.type[k - 1]; if (tt === 0 || tt === 2) { bits |= 1; c++; } tt = this.type[k + 1]; if (tt === 0 || tt === 2) { bits |= 2; c++; }
			tt = this.type[k - sy]; if (tt === 0 || tt === 2) { bits |= 4; c++; } tt = this.type[k + sy]; if (tt === 0 || tt === 2) { bits |= 8; c++; }
			tt = this.type[k - sz]; if (tt === 0 || tt === 2) { bits |= 16; c++; } tt = this.type[k + sz]; if (tt === 0 || tt === 2) { bits |= 32; c++; }
			this.nb[k] = bits; this.cnt[k] = c;
		}
		this.dirichlet = m !== "box";
		this.clearSolids();
	};
	Fluid3.prototype.clearSolids = function () {
		for (var k = 0; k < this.N; k++) if (this.type[k] === 1) { this.u[k] = this.v[k] = this.w[k] = this.s[k] = this.T[k] = this.c[k] = 0; this.q[k] = 0; }
	};
	Fluid3.prototype.clear = function () {
		this.u.fill(0); this.v.fill(0); this.w.fill(0); this.T.fill(0); this.s.fill(0); this.c.fill(0); this.q.fill(0); this.div.fill(0);
		this.time = 0; this.steps = 0; this.pulses = [];
		if (this.mode === "tunnel") this.initUniform();
	};
	Fluid3.prototype.initUniform = function () {
		for (var k = 0; k < this.N; k++) if (this.type[k] !== 1) this.u[k] = this.U;
	};
	/* obstacle: "sphere" / "cube" (cx, cy, cz, r in cells) or null */
	Fluid3.prototype.setObstacle = function (kind, cx, cy, cz, r) {
		var nx = this.nx, ny = this.ny, nz = this.nz, k, x, y, z; this.obst.fill(0);
		if (kind) for (z = 1; z < nz - 1; z++) for (y = 1; y < ny - 1; y++) for (x = 1; x < nx - 1; x++) {
			var dx = x - cx, dy = y - cy, dz = z - cz, hit = kind === "sphere" ? dx * dx + dy * dy + dz * dz <= r * r : Math.abs(dx) <= r * 0.85 && Math.abs(dy) <= r * 0.85 && Math.abs(dz) <= r * 0.85;
			if (hit) this.obst[x + this.sy * y + this.sz * z] = 1;
		}
		this.rebuild();
	};

	/* ---------------- advection ---------------- */
	function advect(sim, ins, outs) {
		var nx = sim.nx, ny = sim.ny, nz = sim.nz, sy = sim.sy, sz = sim.sz, u = sim.u, v = sim.v, w = sim.w, type = sim.type, nf = ins.length, f;
		for (f = 0; f < nf; f++) outs[f].set(ins[f]);
		var mx = nx - 1.001, my = ny - 1.001, mz = nz - 1.001, x, y, z, k;
		for (z = 1; z < nz - 1; z++) for (y = 1; y < ny - 1; y++) for (x = 1; x < nx - 1; x++) {
			k = x + sy * y + sz * z; if (type[k] !== 0) continue;
			var px = x - u[k], py = y - v[k], pz = z - w[k];
			px = px < 0 ? 0 : px > mx ? mx : px; py = py < 0 ? 0 : py > my ? my : py; pz = pz < 0 ? 0 : pz > mz ? mz : pz;
			var i0 = px | 0, j0 = py | 0, k0 = pz | 0, fx = px - i0, fy = py - j0, fz = pz - k0, gx = 1 - fx, gy = 1 - fy, gz = 1 - fz;
			var b = i0 + sy * j0 + sz * k0, w000 = gx * gy * gz, w100 = fx * gy * gz, w010 = gx * fy * gz, w110 = fx * fy * gz, w001 = gx * gy * fz, w101 = fx * gy * fz, w011 = gx * fy * fz, w111 = fx * fy * fz;
			for (f = 0; f < nf; f++) {
				var a = ins[f];
				outs[f][k] = w000 * a[b] + w100 * a[b + 1] + w010 * a[b + sy] + w110 * a[b + sy + 1] + w001 * a[b + sz] + w101 * a[b + sz + 1] + w011 * a[b + sz + sy] + w111 * a[b + sz + sy + 1];
			}
		}
	}

	/* ---------------- forces ---------------- */
	Fluid3.prototype.confine = function () {
		var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz, u = this.u, v = this.v, w = this.w, wx = this.wx, wy = this.wy, wz = this.wz, wm = this.wm, x, y, z, k, eps = this.vort, type = this.type;
		for (z = 1; z < nz - 1; z++) for (y = 1; y < ny - 1; y++) for (x = 1; x < nx - 1; x++) {
			k = x + sy * y + sz * z;
			var a = 0.5 * ((w[k + sy] - w[k - sy]) - (v[k + sz] - v[k - sz])), b = 0.5 * ((u[k + sz] - u[k - sz]) - (w[k + 1] - w[k - 1])), c = 0.5 * ((v[k + 1] - v[k - 1]) - (u[k + sy] - u[k - sy]));
			wx[k] = a; wy[k] = b; wz[k] = c; wm[k] = Math.sqrt(a * a + b * b + c * c);
		}
		for (z = 2; z < nz - 2; z++) for (y = 2; y < ny - 2; y++) for (x = 2; x < nx - 2; x++) {
			k = x + sy * y + sz * z; if (type[k] !== 0) continue;
			var gx = 0.5 * (wm[k + 1] - wm[k - 1]), gy = 0.5 * (wm[k + sy] - wm[k - sy]), gz = 0.5 * (wm[k + sz] - wm[k - sz]), len = Math.sqrt(gx * gx + gy * gy + gz * gz) + 1e-6;
			gx /= len; gy /= len; gz /= len;
			u[k] += eps * (gy * wz[k] - gz * wy[k]); v[k] += eps * (gz * wx[k] - gx * wz[k]); w[k] += eps * (gx * wy[k] - gy * wx[k]);
		}
	};

	/* ---------------- projection ---------------- */
	Fluid3.prototype.project = function () {
		var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz, u = this.u, v = this.v, w = this.w, q = this.q, div = this.div, nb = this.nb, cnt = this.cnt, x, y, z, k, it, color;
		for (z = 1; z < nz - 1; z++) for (y = 1; y < ny - 1; y++) for (x = 1; x < nx - 1; x++) {
			k = x + sy * y + sz * z; div[k] = cnt[k] ? 0.5 * (u[k + 1] - u[k - 1] + v[k + sy] - v[k - sy] + w[k + sz] - w[k - sz]) : 0;
		}
		var om = this.omega, iters = this.iters;
		for (it = 0; it < iters; it++) for (color = 0; color < 2; color++) for (z = 1; z < nz - 1; z++) for (y = 1; y < ny - 1; y++) {
			for (x = 1 + ((color + y + z + 1) & 1); x < nx - 1; x += 2) {
				k = x + sy * y + sz * z; var m = nb[k]; if (!m) continue;
				var s = 0;
				if (m & 1) s += q[k - 1]; if (m & 2) s += q[k + 1]; if (m & 4) s += q[k - sy]; if (m & 8) s += q[k + sy]; if (m & 16) s += q[k - sz]; if (m & 32) s += q[k + sz];
				q[k] += om * ((s - div[k]) / cnt[k] - q[k]);
			}
		}
		if (!this.dirichlet) {
			var sum = 0, n = 0; for (k = 0; k < this.N; k++) if (cnt[k]) { sum += q[k]; n++; } if (n) { var mean = sum / n; for (k = 0; k < this.N; k++) if (cnt[k]) q[k] -= mean; }
		}
		for (z = 1; z < nz - 1; z++) for (y = 1; y < ny - 1; y++) for (x = 1; x < nx - 1; x++) {
			k = x + sy * y + sz * z; var mm = nb[k]; if (!cnt[k]) continue; var qc = q[k];
			u[k] -= 0.5 * ((mm & 2 ? q[k + 1] : qc) - (mm & 1 ? q[k - 1] : qc));
			v[k] -= 0.5 * ((mm & 8 ? q[k + sy] : qc) - (mm & 4 ? q[k - sy] : qc));
			w[k] -= 0.5 * ((mm & 32 ? q[k + sz] : qc) - (mm & 16 ? q[k - sz] : qc));
		}
	};

	/* ---------------- boundaries + sources ---------------- */
	Fluid3.prototype.boundaries = function () {
		var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz, type = this.type, u = this.u, v = this.v, w = this.w, x, y, z, k;
		for (z = 0; z < nz; z++) for (y = 0; y < ny; y++) for (x = 0; x < nx; x++) {
			k = x + sy * y + sz * z; var t = type[k]; if (t === 0) continue;
			if (t === 1) { u[k] = v[k] = w[k] = 0; this.s[k] = 0; this.T[k] = 0; }
			else if (t === 3) {
				u[k] = this.U; v[k] = 0; w[k] = 0; this.T[k] = 0;
				if (this.rake) { var on = (y % 5) < 2 && (z % 5) < 2; this.s[k] = on ? 1 : 0; this.c[k] = (y / ny + z / nz) * 0.5; } else this.s[k] = 0;
			} else if (t === 2) {   // outflow: copy from the inside neighbour
				var d = x === nx - 1 ? -1 : y === ny - 1 ? -sy : 0; if (d) { var j = k + d; u[k] = u[j]; v[k] = v[j]; w[k] = w[j]; this.s[k] = this.s[j]; this.T[k] = this.T[j]; this.c[k] = this.c[j]; }
			}
		}
	};
	Fluid3.prototype.applySources = function () {
		var i, h, nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz;
		for (i = 0; i < this.heaters.length; i++) {
			h = this.heaters[i]; var r = h.r, x0 = Math.max(1, Math.floor(h.x - r)), x1 = Math.min(nx - 2, Math.ceil(h.x + r)), y0 = Math.max(1, Math.floor(h.y - r)), y1 = Math.min(ny - 2, Math.ceil(h.y + r)), z0 = Math.max(1, Math.floor(h.z - r)), z1 = Math.min(nz - 2, Math.ceil(h.z + r));
			for (var z = z0; z <= z1; z++) for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
				var d2 = (x - h.x) * (x - h.x) + (y - h.y) * (y - h.y) + (z - h.z) * (z - h.z); if (d2 > r * r) continue; var k = x + sy * y + sz * z, f = 1 - Math.sqrt(d2) / (r + 0.01);
				if (this.type[k] !== 0) continue; this.T[k] = Math.max(this.T[k], h.T * f); this.s[k] = Math.max(this.s[k], h.s * f); this.c[k] = h.c; if (h.up) this.v[k] = Math.max(this.v[k], h.up * f);
			}
		}
		for (i = this.pulses.length - 1; i >= 0; i--) {
			var p = this.pulses[i]; this.applyPulse(p); if (--p.left <= 0) this.pulses.splice(i, 1);
		}
	};
	/* smoke-ring cannon: for `steps` steps push the fluid along (dx,dy,dz) through a circular orifice of radius R; the shear at its rim rolls up into a vortex ring.
	   Smoke is seeded in an annulus at the rim so the ring is visible. */
	Fluid3.prototype.fire = function (cx, cy, cz, dx, dy, dz, R, speed, steps, tag) {
		var l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1; this.pulses.push({ cx: cx, cy: cy, cz: cz, dx: dx / l, dy: dy / l, dz: dz / l, R: R, speed: speed, left: steps || 6, len: 2.2, tag: tag || 0 });
	};
	Fluid3.prototype.applyPulse = function (p) {
		var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz, R = p.R, ext = Math.ceil(R + p.len + 2);
		for (var z = Math.max(1, Math.floor(p.cz - ext)); z <= Math.min(nz - 2, Math.ceil(p.cz + ext)); z++) for (var y = Math.max(1, Math.floor(p.cy - ext)); y <= Math.min(ny - 2, Math.ceil(p.cy + ext)); y++) for (var x = Math.max(1, Math.floor(p.cx - ext)); x <= Math.min(nx - 2, Math.ceil(p.cx + ext)); x++) {
			var rx = x - p.cx, ry = y - p.cy, rz = z - p.cz, ax = rx * p.dx + ry * p.dy + rz * p.dz;
			if (ax < -p.len * 0.5 || ax > p.len * 0.5) continue;
			var px = rx - ax * p.dx, py = ry - ax * p.dy, pz = rz - ax * p.dz, rad = Math.sqrt(px * px + py * py + pz * pz); if (rad > R) continue;
			var k = x + sy * y + sz * z; if (this.type[k] !== 0) continue; var prof = 1 - Math.pow(rad / R, 6);
			this.u[k] += p.speed * p.dx * prof; this.v[k] += p.speed * p.dy * prof; this.w[k] += p.speed * p.dz * prof;
			if (rad > R * 0.55) { this.s[k] = Math.max(this.s[k], 1.0); this.c[k] = p.tag; }
		}
	};
	Fluid3.prototype.splat = function (x, y, z, vx, vy, vz, rad, s, c, T) {
		var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz, e = Math.ceil(rad * 2.2);
		for (var zz = Math.max(1, Math.floor(z - e)); zz <= Math.min(nz - 2, Math.ceil(z + e)); zz++) for (var yy = Math.max(1, Math.floor(y - e)); yy <= Math.min(ny - 2, Math.ceil(y + e)); yy++) for (var xx = Math.max(1, Math.floor(x - e)); xx <= Math.min(nx - 2, Math.ceil(x + e)); xx++) {
			var k = xx + sy * yy + sz * zz; if (this.type[k] !== 0) continue; var d2 = (xx - x) * (xx - x) + (yy - y) * (yy - y) + (zz - z) * (zz - z), g = Math.exp(-d2 / (2 * rad * rad));
			this.u[k] += vx * g; this.v[k] += vy * g; this.w[k] += vz * g;
			if (s) { this.s[k] = Math.min(1.5, this.s[k] + s * g); if (c !== undefined) this.c[k] = c; } if (T) this.T[k] = Math.min(1.5, this.T[k] + T * g);
		}
	};

	/* ---------------- one step ---------------- */
	Fluid3.prototype.step = function () {
		var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz, x, y, z, k, o = this.o;
		this.applySources();
		if (this.beta) { var T = this.T, v = this.v, b = this.beta; for (k = 0; k < this.N; k++) v[k] += b * T[k]; }
		if (this.vort > 0) this.confine();
		this.boundaries();
		// velocity
		advect(this, [this.u, this.v, this.w], [o[0], o[1], o[2]]);
		var t0 = this.u, t1 = this.v, t2 = this.w; this.u = o[0]; this.v = o[1]; this.w = o[2]; o[0] = t0; o[1] = t1; o[2] = t2;
		this.boundaries();
		this.project();
		this.boundaries();
		// scalars ride the new velocity
		var ins = [this.T, this.s, this.c];
		advect(this, ins, [o[3], o[4], o[5]]);
		this.T = o[3]; this.s = o[4]; this.c = o[5]; o[3] = ins[0]; o[4] = ins[1]; o[5] = ins[2];
		var fade = 1 - this.fade, cool = 1 - this.cool; if (fade < 1 || cool < 1) { var s = this.s, TT = this.T; for (k = 0; k < this.N; k++) { s[k] *= fade; TT[k] *= cool; } }
		this.boundaries();
		this.steps++; this.time += 1;
	};

	Fluid3.prototype.stats = function () {
		var nx = this.nx, ny = this.ny, nz = this.nz, sy = this.sy, sz = this.sz, u = this.u, v = this.v, w = this.w, ke = 0, n = 0, vmax = 0, dmax = 0, ssum = 0, sy_ = 0, x, y, z, k;
		for (z = 1; z < nz - 1; z++) for (y = 1; y < ny - 1; y++) for (x = 1; x < nx - 1; x++) {
			k = x + sy * y + sz * z; if (this.type[k] !== 0) continue;
			var s2 = u[k] * u[k] + v[k] * v[k] + w[k] * w[k]; ke += 0.5 * s2; n++; if (s2 > vmax) vmax = s2;
			var d = Math.abs(0.5 * (u[k + 1] - u[k - 1] + v[k + sy] - v[k - sy] + w[k + sz] - w[k - sz])); if (d > dmax && this.cnt[k] === 6) dmax = d;
			ssum += this.s[k]; sy_ += this.s[k] * y;
		}
		return { ke: n ? ke / n : 0, vmax: Math.sqrt(vmax), divmax: dmax, smoke: ssum, smokeY: ssum > 1e-9 ? sy_ / ssum : 0, cells: n };
	};

	/* pack the fields for the GPU: R = smoke, G = temperature, B = colour tag, A = 255 inside a solid, else speed / 2 (0..127). One RGBA8 3D texture. */
	Fluid3.prototype.pack = function (out, speedScale) {
		var N = this.N, u = this.u, v = this.v, w = this.w, s = this.s, T = this.T, c = this.c, type = this.type, inv = 127 / Math.max(0.05, speedScale || 1), j = 0, k;
		for (k = 0; k < N; k++, j += 4) {
			if (type[k] === 1) { out[j] = 0; out[j + 1] = 0; out[j + 2] = 0; out[j + 3] = this.obst[k] ? 255 : 0; continue; }   // only real obstacles are drawn solid; the box walls stay see-through
			var sv = s[k], tv = T[k], sp = Math.sqrt(u[k] * u[k] + v[k] * v[k] + w[k] * w[k]) * inv;
			out[j] = sv <= 0 ? 0 : sv >= 1 ? 255 : (sv * 255) | 0; out[j + 1] = tv <= 0 ? 0 : tv >= 1 ? 255 : (tv * 255) | 0;
			var cv = c[k]; out[j + 2] = cv <= 0 ? 0 : cv >= 1 ? 255 : (cv * 255) | 0; out[j + 3] = sp >= 127 ? 127 : sp | 0;
		}
	};

	/* ---------------- scenarios ---------------- */
	/* dims: [nx, ny, nz] as multiples of `base` (cells along the shortest side). Positions are fractions of the box. */
	var PRESETS = [
		{ id: "plume", name: "Rising hot smoke plume", mode: "opentop", dims: [1, 1.5, 1], beta: 0.09, vort: 0.3, U: 0, heat: true, note: "A heater on the floor warms the smoke; hot smoke is lighter, so it rises and curls into billowing mushroom puffs. Drag in Stir mode to push it around." },
		{ id: "ring", name: "Smoke ring cannon", mode: "box", dims: [1, 1, 1.6], beta: 0, vort: 0.08, U: 0, ring: 1, note: "A puff of air through a round hole rolls up into a smoke ring that travels on its own. Fire as many as you like (key F) and watch them wobble, stretch and fall apart." },
		{ id: "collide", name: "Two rings colliding", mode: "box", dims: [1, 1, 1.6], beta: 0, vort: 0.08, U: 0, ring: 2, note: "Two rings fired head-on. As they meet they flatten, their cores cancel, and the ring bursts outward into a wider, slower one: a classic vortex-ring collision." },
		{ id: "sphere", name: "Wind past a sphere", mode: "tunnel", dims: [2, 1, 1], beta: 0, vort: 0.12, U: 1.0, obstacle: "sphere", note: "A steady wind from the left carries coloured smoke past a ball. Behind it the flow separates and curls into a turbulent wake. Switch the obstacle to a cube to compare." },
		{ id: "stir", name: "Stir a smoke tank", mode: "box", dims: [1, 1, 1], beta: 0, vort: 0.15, U: 0, init: "layers", note: "A closed tank with layers of coloured smoke. Choose Stir and drag through the tank to swirl them together. Orbit to look at it from any side." }
	];
	var BYID = {}; PRESETS.forEach(function (p) { BYID[p.id] = p; });

	var API = { Fluid3: Fluid3, PRESETS: PRESETS, BYID: BYID };
	if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MESFluid3 = API;
})(typeof window !== "undefined" ? window : globalThis);

/* MES 3D Fluid Simulator -- mes.fm/3d-fluid-simulator
 * UI + renderer around MESFluid3 (lib.js: the CPU solver). The smoke is drawn by a WebGL2 ray-marcher over one RGBA8 3D texture (R smoke, G temperature, B colour tag,
 * A speed / solid), with an orbit camera; without WebGL2 a flat top-down canvas projection is shown instead. State: localStorage "mes-3d-fluid-simulator:v1".
 * Links: ?p=&res=&beta=&vort=&u=&ob=&view=&dens=
 */
(function () {
	"use strict";
	var $ = function (id) { return document.getElementById(id); };
	var root = $("f3"); if (!root) return;
	var F3 = window.MESFluid3, KEY = "mes-3d-fluid-simulator:v1";
	function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
	function sget() { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; } }
	function sset(o) { try { var c = sget(); for (var k in o) c[k] = o[k]; localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) {} }
	var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
	var saved = sget(), q = new URLSearchParams(location.search), fromLink = !!q.get("p");
	function num(k, d, lo, hi) { var x = parseFloat(q.get(k)); return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : d; }
	var cfg = {
		preset: F3.BYID[q.get("p")] ? q.get("p") : (F3.BYID[saved.preset] ? saved.preset : "plume"),
		res: [24, 32, 40, 48].indexOf(+(q.get("res") || saved.res)) >= 0 ? +(q.get("res") || saved.res) : (coarse ? 24 : 32),
		speed: [0.5, 1, 2].indexOf(+saved.speed) >= 0 ? +saved.speed : 1, view: Math.round(num("view", saved.view || 0, 0, 2)),
		dens: num("dens", 1.7, 0.3, 3), spin: !!saved.spin, tool: "orbit", fade: false, auto: false
	};

	/* ---------- scenario ---------- */
	var canvas = $("f3-canvas"), sim = null, P = null, par = null, running = true, acc = 0, lastT = 0, buf = null, stepMs = 0, frameN = 0, autoT = 0, stepsDone = 0;
	var cam = { yaw: 0.65, pitch: 0.32, dist: 2.35 }, size = [1, 1, 1], dims = [1, 1, 1];

	function load(id, ov) {
		ov = ov || {}; P = F3.BYID[id]; cfg.preset = id;
		var base = cfg.res; dims = P.dims.map(function (m) { return Math.max(12, Math.round(base * m)); });
		sim = new F3.Fluid3(dims[0], dims[1], dims[2]);
		par = { beta: ov.beta != null ? ov.beta : P.beta, vort: ov.vort != null ? ov.vort : P.vort, U: ov.U != null ? ov.U : (P.U || 1), ob: ov.ob || P.obstacle || "none" };
		sim.mode = P.mode; sim.beta = par.beta; sim.vort = par.vort; sim.U = par.U; sim.fade = cfg.fade || P.mode === "tunnel" ? 0.006 : 0;
		var mx = Math.max(dims[0], dims[1], dims[2]); size = [dims[0] / mx, dims[1] / mx, dims[2] / mx];
		setupScene(); sim.rebuild(); sim.clear(); initFields();
		buf = new Uint8Array(sim.N * 4); stepsDone = 0; autoT = 0; acc = 0;
		if (gl) allocTexture();
		$("f3-preset").value = id; paintUi(); draw(true); readouts();
	}
	function setupScene() {
		var nx = dims[0], ny = dims[1], nz = dims[2], base = cfg.res;
		sim.heaters = []; sim.pulses = [];
		if (P.heat) sim.heaters.push({ x: nx / 2, y: 2.4, z: nz / 2, r: Math.max(3, base * 0.14), T: 1, s: 1, c: 0.12 });
		if (P.obstacle) obstacle(par.ob);
		else sim.setObstacle(null);
	}
	function obstacle(kind) {
		var nx = dims[0], ny = dims[1], nz = dims[2];
		if (!kind || kind === "none") sim.setObstacle(null); else sim.setObstacle(kind, nx * 0.27, ny / 2, nz / 2, ny * 0.17);
	}
	function initFields() {
		var nx = dims[0], ny = dims[1], nz = dims[2], k, x, y, z;
		if (P.mode === "tunnel") sim.initUniform();
		if (P.init === "layers") {
			for (z = 1; z < nz - 1; z++) for (y = 1; y < ny - 1; y++) for (x = 1; x < nx - 1; x++) {
				k = x + sim.sy * y + sim.sz * z; var h = y / ny, band = Math.floor(h * 6);
				if (band % 2 === 0) { sim.s[k] = 0.85; sim.c[k] = 0.1 + h * 0.8; }
			}
		}
		if (P.ring) fireRings();
		if (P.mode === "tunnel" && P.id === "sphere") sim.boundaries();
	}
	function fireRings() {
		var nx = dims[0], ny = dims[1], nz = dims[2], R = Math.max(3, cfg.res * 0.16), sp = 0.9, base = P.ring;
		sim.fire(nx / 2, ny / 2, 4, 0, 0, 1, R, sp, 6, 0.15);
		if (base === 2) sim.fire(nx / 2, ny / 2, nz - 5, 0, 0, -1, R, sp, 6, 0.85);
	}
	function restart() { load(cfg.preset, { beta: par.beta, vort: par.vort, U: par.U, ob: par.ob }); }

	/* ---------- UI ---------- */
	$("f3-preset").innerHTML = F3.PRESETS.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + "</option>"; }).join("");
	function paintUi() {
		$("f3-note").textContent = P.note;
		$("f3-beta-f").hidden = !(P.heat || par.beta > 0) && P.id !== "plume"; $("f3-u-f").hidden = P.mode !== "tunnel"; $("f3-ob-f").hidden = P.mode !== "tunnel";
		$("f3-fire").hidden = !P.ring; $("f3-auto-w").hidden = !P.ring;
		$("f3-beta-in").value = par.beta; $("f3-vort-in").value = par.vort; $("f3-u-in").value = par.U; $("f3-dens-in").value = cfg.dens; $("f3-ob").value = par.ob;
		$("f3-res").value = String(cfg.res); $("f3-speed").value = String(cfg.speed); $("f3-fade").checked = sim.fade > 0; $("f3-auto").checked = cfg.auto;
		$("f3-grid").textContent = dims.join(" × "); $("f3-cells").textContent = (sim.N / 1000).toFixed(0) + "K cells";
		paintNums(); paintViews(); paintTool();
	}
	function paintNums() { $("f3-beta-v").textContent = par.beta ? par.beta.toFixed(3) : "off"; $("f3-vort-v").textContent = par.vort ? par.vort.toFixed(2) : "off"; $("f3-u-v").textContent = par.U.toFixed(2) + " cells/step"; $("f3-dens-v").textContent = cfg.dens.toFixed(2); }
	function paintViews() { [].forEach.call(document.querySelectorAll("[data-view]"), function (b) { b.setAttribute("aria-pressed", String(+b.dataset.view === cfg.view)); }); $("f3-spin").setAttribute("aria-pressed", String(cfg.spin)); }
	function paintTool() { [].forEach.call(document.querySelectorAll("[data-tool]"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.tool === cfg.tool)); }); canvas.className = cfg.tool === "stir" ? "is-stir" : "is-orbit"; $("f3-hint").textContent = cfg.tool === "stir" ? "Drag to push the smoke" : "Drag to rotate · scroll to zoom"; $("f3-hint").classList.remove("is-gone"); }
	$("f3-preset").onchange = function () { load(this.value); sset({ preset: cfg.preset }); history.replaceState(null, "", location.pathname); };
	$("f3-play").onclick = function () { setRunning(!running); };
	function setRunning(on) { running = on; var b = $("f3-play"); b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "❚❚ Pause" : "▶ Play"; }
	$("f3-step").onclick = function () { setRunning(false); stepOnce(); draw(true); readouts(); };
	$("f3-reset").onclick = restart;
	$("f3-fire").onclick = function () { fireRings(); };
	$("f3-beta-in").oninput = function () { par.beta = +this.value; sim.beta = par.beta; paintNums(); };
	$("f3-vort-in").oninput = function () { par.vort = +this.value; sim.vort = par.vort; paintNums(); };
	$("f3-u-in").oninput = function () { par.U = +this.value; sim.U = par.U; paintNums(); };
	$("f3-dens-in").oninput = function () { cfg.dens = +this.value; paintNums(); draw(true); };
	$("f3-ob").onchange = function () { par.ob = this.value; obstacle(par.ob); sim.clearSolids(); };
	$("f3-res").onchange = function () { cfg.res = +this.value; sset({ res: cfg.res }); restart(); };
	$("f3-speed").onchange = function () { cfg.speed = +this.value; sset({ speed: cfg.speed }); };
	$("f3-fade").onchange = function () { cfg.fade = this.checked; sim.fade = this.checked ? 0.006 : 0; };
	$("f3-auto").onchange = function () { cfg.auto = this.checked; autoT = 0; };
	$("f3-clearsmoke").onclick = function () { sim.s.fill(0); sim.T.fill(0); sim.c.fill(0); if (P.init === "layers") initFields(); draw(true); toast("Smoke cleared"); };
	document.querySelector(".f3-views").addEventListener("click", function (e) {
		var b = e.target.closest("button"); if (!b) return;
		if (b.dataset.view != null) { cfg.view = +b.dataset.view; sset({ view: cfg.view }); } else if (b.id === "f3-spin") { cfg.spin = !cfg.spin; sset({ spin: cfg.spin }); }
		paintViews(); draw(true);
	});
	document.querySelector(".f3-brushes").addEventListener("click", function (e) { var b = e.target.closest("[data-tool]"); if (!b) return; cfg.tool = b.dataset.tool; paintTool(); });

	/* ---------- stepping ---------- */
	var dirty = true;
	function stepOnce() { var t0 = performance.now(); sim.step(); var ms = performance.now() - t0; stepMs = stepMs ? stepMs * 0.85 + ms * 0.15 : ms; stepsDone++; dirty = true; }
	function frame(t) {
		requestAnimationFrame(frame);
		if (!sim || document.hidden) { lastT = t; return; }
		var dt = Math.min(0.1, (t - (lastT || t)) / 1000); lastT = t;
		if (cfg.spin) { cam.yaw += dt * 0.25; dirty = true; }
		if (running) {
			acc += dt * 30 * cfg.speed; if (acc > 4) acc = 4;
			var t0 = performance.now(), n = 0;
			while (acc >= 1 && (n === 0 || performance.now() - t0 < 14)) { stepOnce(); acc -= 1; n++; }
			if (acc >= 1) acc = 0;
			if (cfg.auto && P.ring) { autoT += dt; if (autoT > 2.4) { autoT = 0; fireRings(); } }
		}
		draw(false);
		if ((frameN++ & 7) === 0) readouts();
	}
	function readouts() { var st = sim.stats(); $("f3-t").textContent = stepsDone; $("f3-vmax").textContent = st.vmax.toFixed(2); $("f3-ms").textContent = stepMs ? stepMs.toFixed(1) + " ms" : "–"; }

	/* ---------- WebGL2 renderer ---------- */
	var gl = null, prog = null, tex = null, U = {}, ctx2d = null;
	var VS = "#version 300 es\nvoid main(){ vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0); }";
	var FS = "#version 300 es\nprecision highp float; precision highp sampler3D;\n" +
		"uniform sampler3D uTex; uniform vec3 uCam, uR, uUp, uF, uSize, uTexel, uLight; uniform vec2 uRes; uniform float uTan, uAsp, uDens; uniform int uMode, uSteps; out vec4 o;\n" +
		"vec3 pal(float t){ return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }\n" +
		"bool box(vec3 ro, vec3 rd, out float t0, out float t1){ vec3 inv = 1.0 / rd; vec3 a = -ro * inv, b = (uSize - ro) * inv; vec3 mn = min(a, b), mx = max(a, b); t0 = max(max(mn.x, mn.y), max(mn.z, 0.0)); t1 = min(min(mx.x, mx.y), mx.z); return t1 > t0; }\n" +
		"void main(){\n" +
		"  vec2 ndc = gl_FragCoord.xy / uRes * 2.0 - 1.0; vec3 rd = normalize(uF + uR * ndc.x * uTan * uAsp + uUp * ndc.y * uTan);\n" +
		"  vec3 bg = mix(vec3(0.03, 0.04, 0.08), vec3(0.08, 0.10, 0.18), gl_FragCoord.y / uRes.y); vec3 col = bg; float t0, t1;\n" +
		"  if (box(uCam, rd, t0, t1)) {\n" +
		"    float dt = (t1 - t0) / float(uSteps); float trans = 1.0; vec3 acc = vec3(0.0);\n" +
		"    float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453); float t = t0 + dt * jit;\n" +
		"    for (int i = 0; i < 200; i++) { if (i >= uSteps) break;\n" +
		"      vec3 uvw = (uCam + rd * t) / uSize; vec4 s = texture(uTex, uvw);\n" +
		"      if (s.a > 0.8) {\n" +
		"        vec3 g = vec3(texture(uTex, uvw + vec3(uTexel.x, 0, 0)).a - texture(uTex, uvw - vec3(uTexel.x, 0, 0)).a, texture(uTex, uvw + vec3(0, uTexel.y, 0)).a - texture(uTex, uvw - vec3(0, uTexel.y, 0)).a, texture(uTex, uvw + vec3(0, 0, uTexel.z)).a - texture(uTex, uvw - vec3(0, 0, uTexel.z)).a);\n" +
		"        vec3 n = -normalize(g + vec3(1e-4)); float l = 0.35 + 0.65 * max(dot(n, normalize(vec3(0.4, 0.8, 0.3))), 0.0); acc += trans * vec3(0.46, 0.52, 0.66) * l; trans = 0.0; break; }\n" +
		"      float d = s.r * uDens;\n" +
		"      if (d > 0.004) {\n" +
		"        float a = 1.0 - exp(-d * dt * 14.0); float sh = texture(uTex, uvw + uLight).r; float lit = exp(-sh * uDens * 0.9) * 0.78 + 0.22; vec3 base;\n" +
		"        if (uMode == 0) base = mix(vec3(0.84, 0.90, 1.0), vec3(1.0, 0.60, 0.22), clamp(s.g * 1.3, 0.0, 1.0));\n" +
		"        else if (uMode == 1) base = pal(s.b); else base = pal(0.65 - 0.65 * clamp(s.a * 2.0, 0.0, 1.0));\n" +
		"        acc += trans * a * base * lit; trans *= 1.0 - a; if (trans < 0.03) break; }\n" +
		"      t += dt; }\n" +
		"    col = bg * trans + acc;\n" +
		"    vec3 hp = uCam + rd * t0; vec3 dd = min(hp, uSize - hp); float e = 0.006; float near = step(dd.x, e) + step(dd.y, e) + step(dd.z, e);\n" +
		"    if (near >= 2.0) col = mix(col, vec3(0.45, 0.52, 0.75), 0.55);\n" +
		"  }\n  o = vec4(col, 1.0);\n}";
	function compile(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
	function initGL() {
		try {
			gl = canvas.getContext("webgl2", { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: "high-performance" }); if (!gl) throw new Error("no webgl2");
			prog = gl.createProgram(); gl.attachShader(prog, compile(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
			if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
			["uTex", "uCam", "uR", "uUp", "uF", "uSize", "uTexel", "uLight", "uRes", "uTan", "uAsp", "uDens", "uMode", "uSteps"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
			gl.bindVertexArray(gl.createVertexArray());
		} catch (e) { gl = null; $("f3-fallback").hidden = false; $("f3-fallback").textContent = "WebGL2 is not available here, so this is a flat top-down view of the smoke."; ctx2d = canvas.getContext("2d"); }
	}
	function allocTexture() {
		if (tex) gl.deleteTexture(tex); tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, tex);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, dims[0], dims[1], dims[2], 0, gl.RGBA, gl.UNSIGNED_BYTE, null); dirty = true;
	}
	function camVectors() {
		var tg = [size[0] / 2, size[1] / 2, size[2] / 2], cp = Math.cos(cam.pitch), pos = [tg[0] + cam.dist * cp * Math.sin(cam.yaw), tg[1] + cam.dist * Math.sin(cam.pitch), tg[2] + cam.dist * cp * Math.cos(cam.yaw)];
		var f = norm([tg[0] - pos[0], tg[1] - pos[1], tg[2] - pos[2]]), r = norm(cross(f, [0, 1, 0])), u = cross(r, f); return { pos: pos, f: f, r: r, u: u, tg: tg };
	}
	function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function norm(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
	var TAN = Math.tan(22.5 * Math.PI / 180);
	var cw = 0, ch = 0;
	function sizeCanvas() {
		var wrap = $("f3-wrap"), st = $("f3-stage"), full = document.fullscreenElement === wrap, W = wrap.clientWidth, maxH = full ? wrap.clientHeight - 40 : window.innerHeight * 0.78, asp = 16 / 10;
		var w = Math.max(260, Math.min(W, maxH * asp)); st.style.width = w + "px"; st.style.height = w / asp + "px";
		var scale = Math.min(window.devicePixelRatio || 1, coarse ? 1 : 1.5); cw = Math.min(1400, Math.round(w * scale)); ch = Math.round(w / asp * scale); canvas.width = cw; canvas.height = ch; dirty = true;
	}
	function draw(force) {
		if (!sim) return; if (!dirty && !force) return; dirty = false;
		if (!gl) { drawFallback(); return; }
		var st = $("f3-stage"); gl.viewport(0, 0, cw, ch); gl.useProgram(prog);
		gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_3D, tex);
		sim.pack(buf, 1.2); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1); gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, dims[0], dims[1], dims[2], gl.RGBA, gl.UNSIGNED_BYTE, buf);
		var c = camVectors(); gl.uniform1i(U.uTex, 0); gl.uniform3fv(U.uCam, c.pos); gl.uniform3fv(U.uR, c.r); gl.uniform3fv(U.uUp, c.u); gl.uniform3fv(U.uF, c.f); gl.uniform3fv(U.uSize, size);
		gl.uniform3f(U.uTexel, 1 / dims[0], 1 / dims[1], 1 / dims[2]); gl.uniform3f(U.uLight, 0.4 * 0.09 / size[0], 0.8 * 0.09 / size[1], 0.3 * 0.09 / size[2]);
		gl.uniform2f(U.uRes, cw, ch); gl.uniform1f(U.uTan, TAN); gl.uniform1f(U.uAsp, cw / ch); gl.uniform1f(U.uDens, cfg.dens); gl.uniform1i(U.uMode, cfg.view); gl.uniform1i(U.uSteps, coarse ? 64 : 110);
		gl.drawArrays(gl.TRIANGLES, 0, 3);
	}
	function drawFallback() {
		if (!ctx2d) return; var nx = dims[0], ny = dims[1], nz = dims[2], img = ctx2d.createImageData(cw, ch), d = img.data, x, y, z;
		for (var py = 0; py < ch; py++) for (var px = 0; px < cw; px++) {
			var gx = Math.min(nx - 1, (px / cw * nx) | 0), gy = Math.min(ny - 1, ((1 - py / ch) * ny) | 0), sum = 0, hot = 0;
			for (z = 0; z < nz; z++) { var k = gx + sim.sy * gy + sim.sz * z; sum += sim.s[k]; hot = Math.max(hot, sim.T[k]); }
			var a = 1 - Math.exp(-sum * cfg.dens * 0.25), o = (py * cw + px) * 4; d[o] = 8 + a * (200 + 55 * hot); d[o + 1] = 10 + a * (215 - 80 * hot); d[o + 2] = 18 + a * (255 - 190 * hot); d[o + 3] = 255;
		}
		ctx2d.putImageData(img, 0, 0);
	}

	/* ---------- pointer: orbit / zoom / stir ---------- */
	var ptrs = {}, lastStir = null, pinch0 = 0;
	function rayAt(e) {
		var r = canvas.getBoundingClientRect(), nx = (e.clientX - r.left) / r.width * 2 - 1, ny = 1 - (e.clientY - r.top) / r.height * 2, c = camVectors(), asp = r.width / r.height;
		var rd = norm([c.f[0] + c.r[0] * nx * TAN * asp + c.u[0] * ny * TAN, c.f[1] + c.r[1] * nx * TAN * asp + c.u[1] * ny * TAN, c.f[2] + c.r[2] * nx * TAN * asp + c.u[2] * ny * TAN]);
		var den = rd[0] * c.f[0] + rd[1] * c.f[1] + rd[2] * c.f[2], t = ((c.tg[0] - c.pos[0]) * c.f[0] + (c.tg[1] - c.pos[1]) * c.f[1] + (c.tg[2] - c.pos[2]) * c.f[2]) / den;
		var p = [c.pos[0] + rd[0] * t, c.pos[1] + rd[1] * t, c.pos[2] + rd[2] * t];
		return [p[0] / size[0] * dims[0] - 0.5, p[1] / size[1] * dims[1] - 0.5, p[2] / size[2] * dims[2] - 0.5];
	}
	canvas.addEventListener("pointerdown", function (e) {
		canvas.setPointerCapture(e.pointerId); ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; $("f3-hint").classList.add("is-gone");
		if (Object.keys(ptrs).length === 2) { var a = Object.keys(ptrs).map(function (k) { return ptrs[k]; }); pinch0 = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); lastStir = null; }
		else if (cfg.tool === "stir") lastStir = rayAt(e);
	});
	canvas.addEventListener("pointermove", function (e) {
		var p = ptrs[e.pointerId]; if (!p) return; var keys = Object.keys(ptrs);
		if (keys.length === 2) { var a = keys.map(function (k) { return ptrs[k]; }); p.x = e.clientX; p.y = e.clientY; var d = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); if (pinch0) { cam.dist = Math.max(1.3, Math.min(5, cam.dist * pinch0 / d)); pinch0 = d; dirty = true; } return; }
		if (cfg.tool === "stir") {
			var g = rayAt(e); if (lastStir) { var vx = (g[0] - lastStir[0]) * 0.9, vy = (g[1] - lastStir[1]) * 0.9, vz = (g[2] - lastStir[2]) * 0.9, m = Math.hypot(vx, vy, vz), cap = 2.2; if (m > cap) { vx *= cap / m; vy *= cap / m; vz *= cap / m; }
				sim.splat(g[0], g[1], g[2], vx, vy, vz, Math.max(1.6, cfg.res * 0.06), 0.35, (stepsDone * 0.013) % 1, 0); dirty = true; }
			lastStir = g; p.x = e.clientX; p.y = e.clientY;
		} else { cam.yaw -= (e.clientX - p.x) * 0.008; cam.pitch = Math.max(-1.4, Math.min(1.4, cam.pitch + (e.clientY - p.y) * 0.008)); p.x = e.clientX; p.y = e.clientY; dirty = true; }
	});
	function up(e) { delete ptrs[e.pointerId]; lastStir = null; pinch0 = 0; }
	canvas.addEventListener("pointerup", up); canvas.addEventListener("pointercancel", up);
	canvas.addEventListener("wheel", function (e) { e.preventDefault(); cam.dist = Math.max(1.3, Math.min(5, cam.dist * Math.exp(e.deltaY * 0.001))); dirty = true; }, { passive: false });
	canvas.addEventListener("dblclick", function () { cam.yaw = 0.65; cam.pitch = 0.32; cam.dist = 2.35; dirty = true; });

	/* ---------- page tools ---------- */
	$("f3-full").onclick = function () { var w = $("f3-wrap"); if (document.fullscreenElement) document.exitFullscreen(); else if (w.requestFullscreen) w.requestFullscreen().catch(function () { toast("Full screen is not available here"); }); };
	document.addEventListener("fullscreenchange", function () { setTimeout(sizeCanvas, 60); });
	$("f3-png").onclick = function () { draw(true); canvas.toBlob(function (b) { if (!b) return; var a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = "3d-fluid-" + P.id + ".png"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000); }); };
	var rt; window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(sizeCanvas, 80); });
	if (window.ResizeObserver) new ResizeObserver(function () { clearTimeout(rt); rt = setTimeout(function () { if (typeof sim !== "undefined" && sim) { sizeCanvas(); draw(true); } }, 60); }).observe($("f3-wrap"));
	document.addEventListener("keydown", function (e) {
		var tag = (e.target.tagName || "").toLowerCase(); if (/^(input|textarea|select)$/.test(tag) || e.ctrlKey || e.metaKey || e.altKey) return;
		if (e.key === " " && (tag === "canvas" || tag === "body")) { e.preventDefault(); setRunning(!running); } else if (e.key === "r" || e.key === "R") restart(); else if ((e.key === "f" || e.key === "F") && P.ring) fireRings(); else if (e.key === "ArrowRight" && tag === "canvas") { e.preventDefault(); $("f3-step").onclick(); }
	});
	var toastT; function toast(msg) { var t = $("f3-toast"); if (!t) { t = document.createElement("div"); t.id = "f3-toast"; t.className = "tu-toast"; document.body.appendChild(t); } t.textContent = msg; t.classList.add("tu-toast--show"); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("tu-toast--show"); }, 2200); }
	$("f3-link").onclick = function () {
		var o = new URLSearchParams(); o.set("p", P.id); o.set("res", cfg.res); o.set("view", cfg.view); o.set("dens", cfg.dens.toFixed(2)); o.set("beta", par.beta.toFixed(3)); o.set("vort", par.vort.toFixed(2)); if (P.mode === "tunnel") { o.set("u", par.U.toFixed(2)); o.set("ob", par.ob); }
		var url = location.origin + location.pathname + "?" + o.toString(); function done() { toast("Link copied"); } if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url);
	};

	/* ---------- start ---------- */
	initGL(); sizeCanvas();
	var ov = {}; if (fromLink) { ov = { beta: q.get("beta") != null ? num("beta", 0, 0, 0.15) : null, vort: q.get("vort") != null ? num("vort", 0, 0, 0.6) : null, U: q.get("u") != null ? num("u", 1, 0.3, 1.6) : null, ob: /^(sphere|cube|none)$/.test(q.get("ob") || "") ? q.get("ob") : null }; }
	load(cfg.preset, ov); if (fromLink) history.replaceState(null, "", location.pathname);
	requestAnimationFrame(frame);
})();
