/* MES Fluid Simulator -- solver (pure JS, runs in the browser and in node: require('./tool_apps_src/fluid-simulator/lib.js')).
 *
 * Incompressible Navier-Stokes in 2D on a regular grid ("stable fluids", Stam 1999, with MacCormack advection):
 *     du/dt + (u . grad) u = -grad(p) / rho + nu * laplacian(u) + f          (momentum)
 *     div(u) = 0                                                             (incompressibility)
 * Units inside the solver: length = one grid cell, time = one step, velocity = cells per step, rho = 1. The page converts to the
 * nondimensional numbers people quote (Reynolds number, t* = t U / L).
 * Storage is y-UP (row j = 1 is the bottom); the renderer flips it. Every field has a one-cell ghost ring (index 0 and n+1) that carries
 * the boundary condition, so the interior is i = 1..nx, j = 1..ny and the stride is S = nx + 2.
 *
 * One step = buoyancy + (optional) vorticity confinement -> advect velocity -> implicit viscosity -> pressure projection ->
 *            advect dye and temperature with the new (divergence-free) velocity.
 * Boundary modes: "tunnel" (inflow on the left, outflow on the right, free-slip top and bottom), "box" (no-slip walls, optional moving lid),
 * "periodic" (wraps in x and y). Solid cells (obstacles, drawn walls) are excluded from the pressure solve (Neumann) and held at zero velocity.
 */
(function (root) {
	"use strict";

	function Fluid(nx, ny) {
		this.nx = nx; this.ny = ny; this.S = nx + 2;
		var n = this.N = this.S * (ny + 2);
		function A() { return new Float32Array(n); }
		this.u = A(); this.v = A(); this.r = A(); this.g = A(); this.b = A(); this.T = A();
		this.q = A(); this.div = A();
		this.G = [A(), A(), A(), A(), A(), A()];     // advection output
		this.H = [A(), A(), A(), A(), A(), A()];     // forward (semi-Lagrangian) pass
		this.shape = new Uint8Array(n); this.user = new Uint8Array(n); this.solid = new Uint8Array(n);
		this.nb = new Uint8Array(n); this.cnt = new Uint8Array(n);
		this.mode = "tunnel"; this.U = 1.5; this.lidU = 1.5;
		this.nu = 0; this.vort = 0; this.beta = 0; this.fade = 0; this.cool = 0.004;
		this.mac = true; this.macGain = 0.75; this.iters = 40; this.omega = 1.85; this.rake = true;
		this.time = 0; this.steps = 0;
		this.rakeCol = new Float32Array((ny + 2) * 3);
		this.probe = null; this.pv = []; this.cross = []; this.pvPrev = 0;
		this.ghostFix = true;
		this.rebuild();
	}

	/* ---------------- geometry ---------------- */
	Fluid.prototype.rebuild = function () {
		var nx = this.nx, ny = this.ny, S = this.S, i, j, k, m = this.mode;
		for (k = 0; k < this.N; k++) this.solid[k] = this.shape[k] | this.user[k];
		var per = m === "periodic", tun = m === "tunnel";
		for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
			k = j * S + i; var bits = 0, c = 0;
			if (this.solid[k]) { this.nb[k] = 0; this.cnt[k] = 0; continue; }
			if (i > 1 ? !this.solid[k - 1] : per) { bits |= 1; c++; }
			if (i < nx ? !this.solid[k + 1] : (per || tun)) { bits |= 2; c++; }
			if (j > 1 ? !this.solid[k - S] : per) { bits |= 4; c++; }
			if (j < ny ? !this.solid[k + S] : per) { bits |= 8; c++; }
			this.nb[k] = bits; this.cnt[k] = c;
		}
		this.dirichlet = per ? false : tun;   // outflow fixes the pressure; a closed or periodic domain only knows it up to a constant
		// the rake: bands of coloured dye entering at the inflow
		var bandH = Math.max(3, Math.round(ny / 24));
		for (j = 0; j <= ny + 1; j++) {
			var band = Math.floor((j - 1) / bandH), on = band >= 0 && band % 3 === 1, hue = (Math.floor(band / 3) % 8) / 8;
			var c3 = on ? hsv(0.52 + hue * 0.62, 0.55, 1) : [0, 0, 0];
			this.rakeCol[j * 3] = c3[0]; this.rakeCol[j * 3 + 1] = c3[1]; this.rakeCol[j * 3 + 2] = c3[2];
		}
		this.bndVel(); this.zeroSolid();
	};
	function hsv(h, s, v) {
		h = ((h % 1) + 1) % 1; var i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
		return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
	}
	Fluid.prototype.zeroSolid = function () {
		var S = this.S, nx = this.nx, ny = this.ny, i, j, k;
		for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) { k = j * S + i; if (this.solid[k]) { this.u[k] = this.v[k] = this.r[k] = this.g[k] = this.b[k] = this.T[k] = 0; this.q[k] = 0; } }
	};
	/* shapes are in fractions of the height / width: cx, cy = centre (0..1), size = diameter / side as a fraction of the height */
	Fluid.prototype.setShape = function (o) {
		var nx = this.nx, ny = this.ny, S = this.S, i, j, k;
		this.shape.fill(0);
		if (o && o.kind && o.kind !== "none") {
			var cx = o.cx * nx, cy = o.cy * ny, D = o.size * ny, r = D / 2, ang = (o.angle || 0) * Math.PI / 180, ca = Math.cos(ang), sa = Math.sin(ang);
			var parts = o.kind === "tandem" ? [[cx, cy + 0.0 * ny], [cx + 2.2 * D, cy + 0.04 * ny]] : o.kind === "pair" ? [[cx, cy + 0.65 * D], [cx, cy - 0.65 * D]] : [[cx, cy]];
			for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
				var x = i - 0.5, y = j - 0.5, hit = false;
				for (var pI = 0; pI < parts.length && !hit; pI++) {
					var dx = x - parts[pI][0], dy = y - parts[pI][1];
					if (o.kind === "square") hit = Math.abs(dx) <= r && Math.abs(dy) <= r;
					else if (o.kind === "plate") { var lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca; hit = Math.abs(lx) <= D * 0.9 && Math.abs(ly) <= Math.max(1.2, D * 0.045); }
					else if (o.kind === "wedge") { var wx = dx / (D * 0.9) + 0.5; hit = wx >= 0 && wx <= 1 && Math.abs(dy) <= r * (1 - wx) * 1.0 + 0.0; }
					else hit = dx * dx + dy * dy <= r * r;   // cylinder, tandem, pair
				}
				if (hit) this.shape[j * S + i] = 1;
			}
		}
		this.rebuild();
	};
	Fluid.prototype.paintSolid = function (cx, cy, rad, val) {
		var S = this.S, i0 = Math.max(1, Math.floor(cx - rad)), i1 = Math.min(this.nx, Math.ceil(cx + rad)), j0 = Math.max(1, Math.floor(cy - rad)), j1 = Math.min(this.ny, Math.ceil(cy + rad));
		for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) { var dx = i - 0.5 - cx, dy = j - 0.5 - cy; if (dx * dx + dy * dy <= rad * rad) this.user[j * S + i] = val ? 1 : 0; }
		this.rebuild();
	};
	Fluid.prototype.clearUser = function () { this.user.fill(0); this.rebuild(); };
	Fluid.prototype.clearFields = function () {
		this.u.fill(0); this.v.fill(0); this.r.fill(0); this.g.fill(0); this.b.fill(0); this.T.fill(0); this.q.fill(0); this.div.fill(0);
		this.time = 0; this.steps = 0; this.pv = []; this.cross = []; this.pvPrev = 0;
		this.bndVel(); this.bndScalar(this.r, 0); this.bndScalar(this.g, 1); this.bndScalar(this.b, 2); this.bndScalar(this.T, -1);
	};

	/* ---------------- boundary conditions ---------------- */
	function wrap(a, nx, ny, S) {
		var i, j;
		for (j = 1; j <= ny; j++) { a[j * S] = a[j * S + nx]; a[j * S + nx + 1] = a[j * S + 1]; }
		for (i = 0; i <= nx + 1; i++) { a[i] = a[ny * S + i]; a[(ny + 1) * S + i] = a[S + i]; }
	}
	Fluid.prototype.bndVel = function () {
		var u = this.u, v = this.v, nx = this.nx, ny = this.ny, S = this.S, m = this.mode, i, j;
		if (m === "periodic") { wrap(u, nx, ny, S); wrap(v, nx, ny, S); return; }
		for (j = 1; j <= ny; j++) {
			var a = j * S, b = a + nx + 1;
			if (m === "tunnel") { u[a] = this.U; v[a] = 0; u[b] = u[b - 1]; v[b] = v[b - 1]; }
			else { u[a] = -u[a + 1]; v[a] = -v[a + 1]; u[b] = -u[b - 1]; v[b] = -v[b - 1]; }
		}
		for (i = 0; i <= nx + 1; i++) {
			var bt = i, tp = (ny + 1) * S + i, bi = S + i, ti = ny * S + i;
			if (m === "tunnel") { u[bt] = u[bi]; v[bt] = -v[bi]; u[tp] = u[ti]; v[tp] = -v[ti]; }
			else { u[bt] = -u[bi]; v[bt] = -v[bi]; u[tp] = 2 * this.lidU - u[ti]; v[tp] = -v[ti]; }
		}
	};
	Fluid.prototype.bndScalar = function (a, ch) {
		var nx = this.nx, ny = this.ny, S = this.S, m = this.mode, i, j;
		if (m === "periodic") { wrap(a, nx, ny, S); return; }
		for (j = 1; j <= ny; j++) {
			var l = j * S, r = l + nx + 1;
			a[l] = m === "tunnel" ? (ch >= 0 && this.rake ? this.rakeCol[j * 3 + ch] : 0) : a[l + 1];
			a[r] = a[r - 1];
		}
		for (i = 0; i <= nx + 1; i++) { a[i] = a[S + i]; a[(ny + 1) * S + i] = a[ny * S + i]; }
	};

	/* ---------------- advection (semi-Lagrangian, optionally MacCormack-corrected) ---------------- */
	function advect(sim, ins, outs, au, av) {
		var nx = sim.nx, ny = sim.ny, S = sim.S, solid = sim.solid, nf = ins.length, H = sim.H, mac = sim.mac, i, j, k, f;
		var xmax = nx + 0.5, ymax = ny + 0.5, gain = sim.macGain;
		for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
			k = j * S + i;
			if (solid[k]) { for (f = 0; f < nf; f++) H[f][k] = 0; continue; }
			var x = i - au[k], y = j - av[k];
			x = x < 0.5 ? 0.5 : x > xmax ? xmax : x; y = y < 0.5 ? 0.5 : y > ymax ? ymax : y;
			var i0 = x | 0, j0 = y | 0, sx = x - i0, sy = y - j0, k0 = j0 * S + i0, w00 = (1 - sx) * (1 - sy), w10 = sx * (1 - sy), w01 = (1 - sx) * sy, w11 = sx * sy;
			for (f = 0; f < nf; f++) { var a = ins[f]; H[f][k] = w00 * a[k0] + w10 * a[k0 + 1] + w01 * a[k0 + S] + w11 * a[k0 + S + 1]; }
		}
		if (!mac) { for (f = 0; f < nf; f++) outs[f].set(H[f]); return; }
		for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
			k = j * S + i;
			if (solid[k]) { for (f = 0; f < nf; f++) outs[f][k] = 0; continue; }
			var x1 = i - au[k], y1 = j - av[k];
			x1 = x1 < 0.5 ? 0.5 : x1 > xmax ? xmax : x1; y1 = y1 < 0.5 ? 0.5 : y1 > ymax ? ymax : y1;
			var i1 = x1 | 0, j1 = y1 | 0, kk = j1 * S + i1;
			var xb = i + au[k], yb = j + av[k];
			xb = xb < 0.5 ? 0.5 : xb > xmax ? xmax : xb; yb = yb < 0.5 ? 0.5 : yb > ymax ? ymax : yb;
			var ib = xb | 0, jb = yb | 0, sxb = xb - ib, syb = yb - jb, kb = jb * S + ib, b00 = (1 - sxb) * (1 - syb), b10 = sxb * (1 - syb), b01 = (1 - sxb) * syb, b11 = sxb * syb;
			for (f = 0; f < nf; f++) {
				var src = ins[f], h = H[f], fwd = h[k];
				var back = b00 * h[kb] + b10 * h[kb + 1] + b01 * h[kb + S] + b11 * h[kb + S + 1];
				var c = fwd + 0.5 * gain * (src[k] - back);
				var p0 = src[kk], p1 = src[kk + 1], p2 = src[kk + S], p3 = src[kk + S + 1];
				var lo = p0 < p1 ? p0 : p1, hi = p0 < p1 ? p1 : p0; if (p2 < lo) lo = p2; if (p2 > hi) hi = p2; if (p3 < lo) lo = p3; if (p3 > hi) hi = p3;
				outs[f][k] = c < lo ? lo : c > hi ? hi : c;
			}
		}
	}

	/* ---------------- forces, viscosity, projection ---------------- */
	Fluid.prototype.addBuoyancy = function () {
		var S = this.S, nx = this.nx, ny = this.ny, beta = this.beta, T = this.T, v = this.v, i, j, k;
		for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) { k = j * S + i; v[k] += beta * T[k]; }
	};
	Fluid.prototype.confine = function () {
		var S = this.S, nx = this.nx, ny = this.ny, u = this.u, v = this.v, w = this.div, i, j, k, eps = this.vort;
		for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) { k = j * S + i; w[k] = 0.5 * ((v[k + 1] - v[k - 1]) - (u[k + S] - u[k - S])); }
		var fx = this._fx || (this._fx = new Float32Array(this.N)), fy = this._fy || (this._fy = new Float32Array(this.N));
		for (j = 2; j < ny; j++) for (i = 2; i < nx; i++) {
			k = j * S + i; if (this.solid[k]) { fx[k] = fy[k] = 0; continue; }
			var gx = 0.5 * (Math.abs(w[k + 1]) - Math.abs(w[k - 1])), gy = 0.5 * (Math.abs(w[k + S]) - Math.abs(w[k - S])), len = Math.sqrt(gx * gx + gy * gy) + 1e-6;
			fx[k] = eps * (gy / len) * w[k]; fy[k] = -eps * (gx / len) * w[k];
		}
		for (j = 2; j < ny; j++) for (i = 2; i < nx; i++) { k = j * S + i; if (!this.solid[k]) { u[k] += fx[k]; v[k] += fy[k]; } }
	};
	Fluid.prototype.diffuse = function () {
		var a = this.nu, S = this.S, nx = this.nx, ny = this.ny, solid = this.solid, d = 1 + 4 * a, comps = [this.u, this.v], c, it, i, j, k, x0 = this.H[0];
		for (c = 0; c < 2; c++) {
			var x = comps[c]; x0.set(x);
			for (it = 0; it < 6; it++) {
				for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) { k = j * S + i; if (solid[k]) continue; x[k] = (x0[k] + a * (x[k - 1] + x[k + 1] + x[k - S] + x[k + S])) / d; }
				if (it === 2 || it === 5) this.bndVel();
			}
		}
	};
	Fluid.prototype.project = function () {
		var S = this.S, nx = this.nx, ny = this.ny, u = this.u, v = this.v, q = this.q, div = this.div, nb = this.nb, cnt = this.cnt, i, j, k, it, color, per = this.mode === "periodic";
		for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) { k = j * S + i; div[k] = nb[k] || cnt[k] ? 0.5 * ((u[k + 1] - u[k - 1]) + (v[k + S] - v[k - S])) : 0; }
		if (per) wrap(q, nx, ny, S);
		var om = this.omega, iters = this.iters;
		for (it = 0; it < iters; it++) {
			for (color = 0; color < 2; color++) {
				for (j = 1; j <= ny; j++) {
					for (i = 1 + ((j + color) & 1); i <= nx; i += 2) {
						k = j * S + i; var m = nb[k]; if (!m) continue;
						var s = 0;
						if (m & 1) s += q[k - 1]; if (m & 2) s += q[k + 1]; if (m & 4) s += q[k - S]; if (m & 8) s += q[k + S];
						q[k] += om * ((s - div[k]) / cnt[k] - q[k]);
					}
				}
				if (per) wrap(q, nx, ny, S);
			}
		}
		if (!this.dirichlet) {   // closed / periodic: pressure only matters up to a constant, pin the mean to 0
			var sum = 0, n = 0; for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) { k = j * S + i; if (cnt[k]) { sum += q[k]; n++; } }
			if (n) { var mean = sum / n; for (j = 0; j <= ny + 1; j++) for (i = 0; i <= nx + 1; i++) q[j * S + i] -= mean; }
		}
		for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
			k = j * S + i; var mm = nb[k]; if (!cnt[k]) continue;
			var pl = mm & 1 ? q[k - 1] : q[k], pr = mm & 2 ? q[k + 1] : q[k], pb = mm & 4 ? q[k - S] : q[k], pt = mm & 8 ? q[k + S] : q[k];
			u[k] -= 0.5 * (pr - pl); v[k] -= 0.5 * (pt - pb);
		}
		this.zeroSolid(); this.bndVel();
	};

	/* ---------------- one step ---------------- */
	Fluid.prototype.step = function () {
		var nx = this.nx, ny = this.ny, S = this.S, i, j, k;
		if (this.beta) this.addBuoyancy();
		if (this.vort > 0) this.confine();
		this.bndVel();
		// velocity
		var G = this.G, outV = [G[0], G[1]];
		advect(this, [this.u, this.v], outV, this.u, this.v);
		var tu = this.u, tv = this.v; this.u = G[0]; this.v = G[1]; G[0] = tu; G[1] = tv;
		this.bndVel();
		if (this.nu > 1e-5) this.diffuse();
		this.project();
		// dye + temperature ride the new velocity
		var ins = [this.r, this.g, this.b, this.T], outs = [G[2], G[3], G[4], G[5]];
		advect(this, ins, outs, this.u, this.v);
		this.r = outs[0]; this.g = outs[1]; this.b = outs[2]; this.T = outs[3]; G[2] = ins[0]; G[3] = ins[1]; G[4] = ins[2]; G[5] = ins[3];
		var fade = 1 - this.fade, cool = 1 - this.cool, r = this.r, g = this.g, b = this.b, T = this.T;
		if (fade < 1 || cool < 1) for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) { k = j * S + i; r[k] *= fade; g[k] *= fade; b[k] *= fade; T[k] *= cool; }
		this.bndScalar(this.r, 0); this.bndScalar(this.g, 1); this.bndScalar(this.b, 2); this.bndScalar(this.T, -1);
		this.steps++; this.time += 1;
		if (this.probe) this.sampleProbe();
	};

	/* vortex-shedding frequency from the sign changes of the cross-stream velocity at a probe point */
	Fluid.prototype.sampleProbe = function () {
		var p = this.probe, k = Math.round(p.y) * this.S + Math.round(p.x), v = this.v[k];
		if (this.pvPrev <= 0 && v > 0 && this.steps > 2) this.cross.push(this.steps - v / (v - this.pvPrev));   // upward zero crossing: one per period
		this.pvPrev = v; this.lastProbe = v;
		if (this.cross.length > 24) this.cross.shift();
	};
	/* period (steps) from the last few upward crossings, or 0 while there is not enough data */
	Fluid.prototype.period = function () {
		var c = this.cross, n = c.length; if (n < 5) return 0;
		var use = Math.min(n, 8), span = c[n - 1] - c[n - use], per = span / (use - 1);
		var last = c[n - 1] - c[n - 2]; return Math.abs(last - per) / per < 0.25 ? per : 0;
	};

	/* ---------------- user input ---------------- */
	Fluid.prototype.splat = function (x, y, dvx, dvy, rad, col, heat) {
		var S = this.S, i0 = Math.max(1, Math.floor(x - 3 * rad)), i1 = Math.min(this.nx, Math.ceil(x + 3 * rad)), j0 = Math.max(1, Math.floor(y - 3 * rad)), j1 = Math.min(this.ny, Math.ceil(y + 3 * rad)), r2 = rad * rad;
		for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) {
			var k = j * S + i; if (this.solid[k]) continue;
			var dx = i - 0.5 - x, dy = j - 0.5 - y, w = Math.exp(-(dx * dx + dy * dy) / (2 * r2));
			this.u[k] += dvx * w; this.v[k] += dvy * w;
			if (col) { this.r[k] = Math.min(1.5, this.r[k] + col[0] * w); this.g[k] = Math.min(1.5, this.g[k] + col[1] * w); this.b[k] = Math.min(1.5, this.b[k] + col[2] * w); }
			if (heat) this.T[k] = Math.min(1.5, this.T[k] + heat * w);
		}
	};

	/* ---------------- diagnostics ---------------- */
	Fluid.prototype.stats = function () {
		var S = this.S, nx = this.nx, ny = this.ny, u = this.u, v = this.v, i, j, k, ke = 0, n = 0, vmax = 0, wmax = 0, dmax = 0;
		for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) {
			k = j * S + i; if (this.solid[k]) continue;
			var s2 = u[k] * u[k] + v[k] * v[k]; ke += 0.5 * s2; n++; if (s2 > vmax) vmax = s2;
			var w = Math.abs(0.5 * ((v[k + 1] - v[k - 1]) - (u[k + S] - u[k - S]))); if (w > wmax && !(this.nb[k] !== 15 && this.mode !== "periodic")) wmax = w;
			var d = Math.abs(0.5 * ((u[k + 1] - u[k - 1]) + (v[k + S] - v[k - S]))); if (d > dmax) dmax = d;
		}
		return { ke: n ? ke / n : 0, vmax: Math.sqrt(vmax), wmax: wmax, divmax: dmax, cells: n };
	};

	/* ---------------- initial conditions ---------------- */
	Fluid.prototype.initTaylorGreen = function (amp) {
		var S = this.S, nx = this.nx, ny = this.ny;
		for (var j = 1; j <= ny; j++) for (var i = 1; i <= nx; i++) {
			var x = 2 * Math.PI * (i - 0.5) / nx, y = 2 * Math.PI * (j - 0.5) / ny, k = j * S + i;
			this.u[k] = amp * Math.sin(x) * Math.cos(y); this.v[k] = -amp * Math.cos(x) * Math.sin(y);
		}
		this.bndVel();
	};
	Fluid.prototype.initShear = function (amp) {   // two layers sliding past each other + a small wiggle: Kelvin-Helmholtz rolls
		var S = this.S, nx = this.nx, ny = this.ny, th = ny * 0.02 + 1;
		for (var j = 1; j <= ny; j++) for (var i = 1; i <= nx; i++) {
			var k = j * S + i, y = j - 0.5, x = i - 0.5, a = Math.tanh((y - ny * 0.25) / th) - Math.tanh((y - ny * 0.75) / th) - 1;
			this.u[k] = amp * a;
			this.v[k] = 0.05 * amp * Math.sin(4 * Math.PI * x / nx) * (Math.exp(-Math.pow((y - ny * 0.25) / (ny * 0.04), 2)) + Math.exp(-Math.pow((y - ny * 0.75) / (ny * 0.04), 2)));
			var up = y > ny * 0.25 && y < ny * 0.75;
			this.r[k] = up ? 0.15 : 0.95; this.g[k] = up ? 0.8 : 0.45; this.b[k] = up ? 1 : 0.15;
		}
		this.bndVel(); this.bndScalar(this.r, 0); this.bndScalar(this.g, 1); this.bndScalar(this.b, 2);
	};
	Fluid.prototype.initVortices = function (gamma, sep) {   // two same-sign vortices: they orbit and merge
		var S = this.S, nx = this.nx, ny = this.ny, sig = ny * 0.07, cx = nx / 2, cy = ny / 2, vs = [[cx - sep * ny / 2, cy, gamma], [cx + sep * ny / 2, cy, gamma]];
		for (var j = 1; j <= ny; j++) for (var i = 1; i <= nx; i++) {
			var k = j * S + i, x = i - 0.5, y = j - 0.5, uu = 0, vv = 0;
			for (var n = 0; n < 2; n++) {
				var dx = x - vs[n][0], dy = y - vs[n][1], r2 = dx * dx + dy * dy + 1e-9, f = vs[n][2] / (2 * Math.PI * r2) * (1 - Math.exp(-r2 / (sig * sig)));
				uu += -dy * f; vv += dx * f;
				var core = Math.exp(-r2 / (2 * sig * sig));
				if (n === 0) { this.r[k] += 1.0 * core; this.g[k] += 0.35 * core; this.b[k] += 0.1 * core; } else { this.r[k] += 0.1 * core; this.g[k] += 0.7 * core; this.b[k] += 1.0 * core; }
			}
			this.u[k] = uu; this.v[k] = vv;
		}
		this.bndVel(); this.bndScalar(this.r, 0); this.bndScalar(this.g, 1); this.bndScalar(this.b, 2);
	};
	Fluid.prototype.initLayers = function (kind) {   // dye pattern to watch mixing in a closed box
		var S = this.S, nx = this.nx, ny = this.ny;
		for (var j = 1; j <= ny; j++) for (var i = 1; i <= nx; i++) {
			var k = j * S + i, x = (i - 0.5) / nx, y = (j - 0.5) / ny, band = kind === "stripes" ? Math.floor(y * 8) % 2 === 0 : x < 0.5;
			var c = hsv(0.55 + (kind === "stripes" ? Math.floor(y * 8) * 0.05 : (x < 0.5 ? 0 : 0.3)), 0.5, 1);
			if (band) { this.r[k] = c[0] * 0.9; this.g[k] = c[1] * 0.9; this.b[k] = c[2] * 0.9; } else { this.r[k] = 0.05; this.g[k] = 0.05; this.b[k] = 0.08; }
		}
		this.bndScalar(this.r, 0); this.bndScalar(this.g, 1); this.bndScalar(this.b, 2);
	};
	/* start a tunnel at its inflow speed so the first frames are not a long empty transient */
	Fluid.prototype.initUniform = function (U, kick) {
		var S = this.S, nx = this.nx, ny = this.ny;
		for (var j = 1; j <= ny; j++) for (var i = 1; i <= nx; i++) { var k = j * S + i; if (!this.solid[k]) { this.u[k] = U; this.v[k] = kick ? kick * Math.sin(2 * Math.PI * i / nx) * Math.exp(-Math.pow((j - ny / 2) / (ny * 0.2), 2)) : 0; } }
		this.bndVel();
	};

	/* ---------------- rendering into an RGBA buffer at grid resolution (y flipped) ---------------- */
	function lerp3(stops, t) {
		t = t < 0 ? 0 : t > 1 ? 1 : t; var n = stops.length - 1, x = t * n, i = Math.min(n - 1, x | 0), f = x - i, a = stops[i], b = stops[i + 1];
		return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
	}
	var VIRIDIS = [[10, 8, 40], [60, 40, 130], [30, 130, 140], [70, 190, 110], [250, 230, 40]];
	var DIVERGE = [[40, 120, 255], [10, 40, 110], [8, 10, 16], [120, 36, 10], [255, 150, 40]];   // negative = blue, zero = dark, positive = orange
	Fluid.prototype.render = function (data, view, opt) {
		opt = opt || {};
		var S = this.S, nx = this.nx, ny = this.ny, u = this.u, v = this.v, i, j, k, o, c, scale;
		var bg = opt.light ? [244, 246, 250] : [8, 11, 18], solidC = opt.light ? [90, 98, 112] : [88, 98, 118];
		var Uref = Math.max(0.2, this.U);
		if (view === "vort") {
			var wsum = 0, wn = 0; for (j = 2; j < ny; j++) for (i = 2; i < nx; i++) { k = j * S + i; if (this.nb[k] === 15 || this.mode === "periodic") { wsum += Math.abs(v[k + 1] - v[k - 1] - u[k + S] + u[k - S]) * 0.5; wn++; } }
			var wm = wn ? wsum / wn : 0; this._wm = this._wm ? this._wm * 0.97 + wm * 0.03 : wm; scale = 1 / Math.max(1e-4, this._wm * 3.2);
		} else if (view === "pressure") {
			var pm = 0; for (j = 1; j <= ny; j++) for (i = 1; i <= nx; i++) { var pq = Math.abs(this.q[j * S + i]); if (pq > pm) pm = pq; }
			this._pm = this._pm ? this._pm * 0.97 + pm * 0.03 : pm; scale = 1 / Math.max(1e-4, this._pm * 0.7);
		}
		for (j = 1; j <= ny; j++) {
			o = ((ny - j) * nx) * 4;
			for (i = 1; i <= nx; i++, o += 4) {
				k = j * S + i;
				if (this.solid[k]) { var hid = opt.hideShape && this.shape[k] && !this.user[k], sc = hid ? bg : solidC; data[o] = sc[0]; data[o + 1] = sc[1]; data[o + 2] = sc[2]; data[o + 3] = 255; continue; }
				if (view === "smoke") {
					var t = this.T[k] * 0.35, rr, gg, bb;
					if (opt.light) { rr = 255 - 255 * Math.min(1, this.g[k] * 0.7 + this.b[k] * 0.7) * 0.9; gg = 255 - 255 * Math.min(1, this.r[k] * 0.7 + this.b[k] * 0.7) * 0.9; bb = 255 - 255 * Math.min(1, this.r[k] * 0.7 + this.g[k] * 0.7) * 0.9; }
					else { rr = bg[0] + (255 - bg[0]) * (1 - Math.exp(-1.6 * this.r[k] - 1.2 * t)); gg = bg[1] + (255 - bg[1]) * (1 - Math.exp(-1.6 * this.g[k] - 0.6 * t)); bb = bg[2] + (255 - bg[2]) * (1 - Math.exp(-1.6 * this.b[k])); }
					data[o] = rr; data[o + 1] = gg; data[o + 2] = bb;
				} else if (view === "speed") {
					c = lerp3(VIRIDIS, Math.sqrt(u[k] * u[k] + v[k] * v[k]) / (Uref * 1.8)); data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2];
				} else if (view === "vort") {
					var w = 0.5 * ((v[k + 1] - v[k - 1]) - (u[k + S] - u[k - S]));
					c = lerp3(DIVERGE, 0.5 + 0.5 * Math.max(-1, Math.min(1, w * scale))); data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2];
				} else {
					c = lerp3(DIVERGE, 0.5 + 0.5 * Math.max(-1, Math.min(1, this.q[k] * scale))); data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2];
				}
				data[o + 3] = 255;
			}
		}
	};

	/* ---------------- presets ---------------- */
	/* size = obstacle diameter (or the box height) as a fraction of the grid height; Re is based on U and that length. */
	var PRESETS = [
		{ id: "cylinder", name: "Cylinder in a wind tunnel", group: "Wind tunnel", mode: "tunnel", aspect: 2, shape: { kind: "cylinder", cx: 0.22, cy: 0.5, size: 0.2 }, U: 1.4, Re: 200, view: "smoke", vort: 0, lref: 0.2, probe: [3.2, 0.5],
		  note: "Water or air flowing past a round post. Above Re ≈ 47 the wake becomes unstable and sheds a Kármán vortex street: alternating swirls, the same effect that makes wires sing and bridges sway. Watch the Strouhal number settle near 0.2." },
		{ id: "square", name: "Square block", group: "Wind tunnel", mode: "tunnel", aspect: 2, shape: { kind: "square", cx: 0.22, cy: 0.5, size: 0.2 }, U: 1.4, Re: 200, view: "smoke", vort: 0, lref: 0.2, probe: [3.2, 0.5],
		  note: "A sharp-cornered block: the flow separates at the corners at any speed, so the wake is wider and shedding is stronger than behind a cylinder." },
		{ id: "plate", name: "Flat plate at an angle (stall)", group: "Wind tunnel", mode: "tunnel", aspect: 2, shape: { kind: "plate", cx: 0.25, cy: 0.5, size: 0.2, angle: 18 }, U: 1.4, Re: 300, view: "vort", vort: 0, lref: 0.36, probe: [3.0, 0.5],
		  note: "A thin plate tilted into the wind, like a crude wing. Try the angle: at small angles the flow hugs the plate, at larger ones it separates and the plate stalls." },
		{ id: "tandem", name: "Two cylinders in a row", group: "Wind tunnel", mode: "tunnel", aspect: 2, shape: { kind: "tandem", cx: 0.16, cy: 0.5, size: 0.14 }, U: 1.4, Re: 200, view: "smoke", vort: 0, lref: 0.14, probe: [3.0, 0.5],
		  note: "The second cylinder sits in the first one's wake, so the two interact: the flow it sees is already turbulent and the pattern is more irregular." },
		{ id: "pair", name: "Two cylinders side by side", group: "Wind tunnel", mode: "tunnel", aspect: 2, shape: { kind: "pair", cx: 0.22, cy: 0.5, size: 0.14 }, U: 1.4, Re: 200, view: "smoke", vort: 0, lref: 0.14, probe: [3.0, 0.5],
		  note: "Wakes from two neighbours merge and flip between patterns: a classic small CFD puzzle." },
		{ id: "wedge", name: "Wedge", group: "Wind tunnel", mode: "tunnel", aspect: 2, shape: { kind: "wedge", cx: 0.22, cy: 0.5, size: 0.24 }, U: 1.4, Re: 250, view: "vort", vort: 0, lref: 0.24, probe: [3.0, 0.5],
		  note: "A triangular body pointing into the flow. A pointed nose splits the flow cleanly; the blunt back sheds vortices." },
		{ id: "tunnel", name: "Empty tunnel (draw your own)", group: "Wind tunnel", mode: "tunnel", aspect: 2, shape: null, U: 1.4, Re: 300, view: "smoke", vort: 0, lref: 0.2, probe: [3.2, 0.5], draw: true,
		  note: "Nothing in the way yet. Choose Draw wall and paint obstacles with your finger or mouse." },
		{ id: "cavity", name: "Lid-driven cavity", group: "Closed box", mode: "box", aspect: 1, shape: null, U: 1.2, Re: 400, view: "smoke", vort: 0, lref: 1, probe: null, init: "stripes", lid: true,
		  note: "A box whose top lid slides sideways, dragging the fluid into a big rotating eddy with small corner eddies. The standard test problem every CFD code is checked against (Re 100, 400, 1000)." },
		{ id: "stir", name: "Stir a tank", group: "Closed box", mode: "box", aspect: 1, shape: null, U: 1.2, Re: 800, view: "smoke", vort: 0.1, lref: 1, probe: null, init: "halves", lid: false, still: true,
		  note: "A closed tank of two coloured liquids. Drag to stir: viscosity (low Re) calms the swirls quickly, high Re keeps them going and stretches the colours into thin filaments." },
		{ id: "plume", name: "Rising hot plume", group: "Closed box", mode: "box", aspect: 1, shape: null, U: 1.2, Re: 3000, view: "smoke", vort: 0.35, lref: 1, probe: null, lid: false, still: true, beta: 0.012, heat: true,
		  note: "A heater on the floor warms the fluid; hot fluid is lighter, rises and curls into mushroom-shaped puffs. Drag to add heat anywhere." },
		{ id: "shear", name: "Kelvin–Helmholtz rolls", group: "Periodic box", mode: "periodic", aspect: 2, shape: null, U: 1.0, Re: 2000, view: "smoke", vort: 0, lref: 1, probe: null, init: "shear", still: true,
		  note: "Two layers slide past each other and the boundary between them rolls up into spirals: the same billows seen in clouds, ocean layers and on Jupiter." },
		{ id: "merge", name: "Two vortices merging", group: "Periodic box", mode: "periodic", aspect: 1, shape: null, U: 1.0, Re: 3000, view: "vort", vort: 0, lref: 1, probe: null, init: "vortices", still: true,
		  note: "Two swirls spinning the same way orbit each other, then fuse into one bigger swirl. This is also how large eddies form in 2D turbulence." },
		{ id: "taylor", name: "Taylor–Green vortex (exact answer)", group: "Periodic box", mode: "periodic", aspect: 1, shape: null, U: 0.3, Re: 60, view: "vort", vort: 0, lref: 1, probe: null, init: "taylor", still: true, exact: true,
		  note: "A checkerboard of swirls that has a known exact solution: it just fades away, its energy dropping like exp(−4νk²t). The page compares the simulation with that curve so you can see how accurate the solver is." }
	];
	var BYID = {}; PRESETS.forEach(function (p) { BYID[p.id] = p; });

	/* viscosity in cells^2 per step from a Reynolds number: nu = U * L / Re */
	function nuFor(U, Lcells, Re) { return U * Lcells / Math.max(1, Re); }
	/* exact kinetic-energy ratio of the Taylor-Green vortex after time t (steps) in a periodic box of nx cells: E(t)/E(0) = exp(-4 nu k^2 t), k = 2 pi / nx */
	function taylorEnergy(nu, nx, t) { var k = 2 * Math.PI / nx; return Math.exp(-4 * nu * k * k * t); }

	var API = { Fluid: Fluid, PRESETS: PRESETS, BYID: BYID, nuFor: nuFor, taylorEnergy: taylorEnergy, hsv: hsv };
	if (typeof module !== "undefined" && module.exports) module.exports = API; else root.MESFluid = API;
})(typeof window !== "undefined" ? window : globalThis);
