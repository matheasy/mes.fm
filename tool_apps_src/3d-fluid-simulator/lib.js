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
