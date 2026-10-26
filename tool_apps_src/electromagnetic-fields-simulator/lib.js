/* Electromagnetic fields maths (pure; node: require('./tool_apps_src/electromagnetic-fields/lib.js')).
   SI units throughout. Electrostatics (point charges 1/r^2 or infinite line charges 1/r), field lines, contours, Gauss's law fluxes,
   wires (Biot-Savart / Ampere), the Boris particle pusher (relativistic option) and a 2D TMz Yee FDTD Maxwell solver. */
(function (root) {
	"use strict";
	var PI = Math.PI, TAU = 2 * PI;
	var K = 8.9875517923e9, EPS0 = 8.8541878128e-12, MU0 = 1.25663706212e-6, C = 299792458, QE = 1.602176634e-19, ME = 9.1093837015e-31, MP = 1.67262192369e-27, AMU = 1.66053906660e-27;

	/* ---------- electrostatics ---------- */
	/* charges: [{x, y, q}] in metres / coulombs (mode "3d": point charges; "2d": infinite line charges, q = coulombs per metre) */
	function fieldAt(ch, x, y, mode, skip) {
		var ex = 0, ey = 0, i, c, dx, dy, r2, f;
		for (i = 0; i < ch.length; i++) {
			if (i === skip) continue; c = ch[i]; dx = x - c.x; dy = y - c.y; r2 = dx * dx + dy * dy; if (r2 < 1e-18) continue;
			f = mode === "2d" ? c.q / (TAU * EPS0 * r2) : K * c.q / (r2 * Math.sqrt(r2)); ex += f * dx; ey += f * dy;
		}
		return [ex, ey];
	}
	function potentialAt(ch, x, y, mode) {
		var v = 0, i, c, r;
		for (i = 0; i < ch.length; i++) { c = ch[i]; r = Math.max(1e-9, Math.hypot(x - c.x, y - c.y)); v += mode === "2d" ? -c.q / (TAU * EPS0) * Math.log(r) : K * c.q / r; }
		return v;
	}
	function forceOn(ch, i, mode) { var e = fieldAt(ch, ch[i].x, ch[i].y, mode, i); return [ch[i].q * e[0], ch[i].q * e[1]]; }
	/* follow the field direction from (x0, y0) (dir +1 along E, -1 against) until near a charge, outside the box or max steps; returns flat [x, y, x, y ...] */
	function traceLine(ch, x0, y0, dir, mode, box, h, maxSteps, stopR) {
		var pts = [x0, y0], x = x0, y = y0, n, e, m, k1x, k1y, k2x, k2y, i, near;
		function d(px, py) { var f = fieldAt(ch, px, py, mode), m = Math.hypot(f[0], f[1]); return m > 0 ? [dir * f[0] / m, dir * f[1] / m] : [0, 0]; }
		for (n = 0; n < maxSteps; n++) {
			e = d(x, y); if (e[0] === 0 && e[1] === 0) break;
			k1x = e[0]; k1y = e[1]; var f2 = d(x + 0.5 * h * k1x, y + 0.5 * h * k1y); k2x = f2[0]; k2y = f2[1];
			var f3 = d(x + 0.5 * h * k2x, y + 0.5 * h * k2y), f4 = d(x + h * f3[0], y + h * f3[1]);
			x += h / 6 * (k1x + 2 * k2x + 2 * f3[0] + f4[0]); y += h / 6 * (k1y + 2 * k2y + 2 * f3[1] + f4[1]);
			pts.push(x, y);
			if (x < box[0] || x > box[2] || y < box[1] || y > box[3]) break;
			near = false; for (i = 0; i < ch.length; i++) if (Math.hypot(x - ch[i].x, y - ch[i].y) < stopR) { near = true; break; } if (near) break;
		}
		return pts;
	}
	/* field lines for a set of charges. Lines start on a small ring round the charges: from every positive charge along the field, and, when there
	   are negative charges too, ALSO backwards from every negative charge (reversed, so every returned line runs the way the field points). Starting
	   from both ends is what fills the region where lines arrive from far away (the underside of a dipole), which a one-ended trace leaves empty. With both
	   signs each charge gets half the usual number of lines so the density is unchanged. A starting point that falls inside another charge (stacked charges)
	   is skipped, so no line is wasted. */
	function fieldLines(ch, mode, box, nMax, stopR, h) {
		var lines = [], pos = ch.filter(function (c) { return c.q > 0; }), neg = ch.filter(function (c) { return c.q < 0; }), both = pos.length && neg.length, qmax = 0;
		ch.forEach(function (c) { if (Math.abs(c.q) > qmax) qmax = Math.abs(c.q); });
		var maxSteps = Math.round(4 * Math.hypot(box[2] - box[0], box[3] - box[1]) / h), r0 = 1.6 * stopR;
		function seeds(c, ci, n) {
			var cand = [], m = Math.max(16, 5 * n), phase = 0.37 + ci * 0.21, k, a, x, y;
			for (k = 0; k < m; k++) {
				a = phase + k * TAU / m; x = c.x + r0 * Math.cos(a); y = c.y + r0 * Math.sin(a);
				if (!ch.some(function (o) { return o !== c && Math.hypot(x - o.x, y - o.y) < 1.1 * stopR; })) cand.push([x, y]);
			}
			if (cand.length <= n) return cand;
			var out = []; for (k = 0; k < n; k++) out.push(cand[Math.floor((k + 0.5) * cand.length / n)]);
			return out;
		}
		function family(src, dir, base) {
			src.forEach(function (c, ci) {
				var n = Math.max(3, Math.round(nMax * Math.abs(c.q) / qmax * (both ? 0.5 : 1)));
				seeds(c, ci + base, n).forEach(function (sd) {
					var l = traceLine(ch, sd[0], sd[1], dir, mode, box, h, maxSteps, stopR);
					if (dir < 0) { var r = []; for (var i = l.length - 2; i >= 0; i -= 2) r.push(l[i], l[i + 1]); l = r; }   /* a backwards trace is reversed so the line runs along the field */
					lines.push(l);
				});
			});
		}
		family(pos, 1, 0);
		if (neg.length) family(neg, -1, pos.length);
		return lines;
	}
	/* marching squares: for each level, segments [x1, y1, x2, y2, ...] of fn(x, y) = level on a regular grid over box (the grid is sampled once) */
	function contours(fn, box, nx, ny, levels) {
		var xs = box[0], ys = box[1], dx = (box[2] - box[0]) / nx, dy = (box[3] - box[1]) / ny, F = new Float64Array((nx + 1) * (ny + 1)), i, j, out = [];
		for (j = 0; j <= ny; j++) for (i = 0; i <= nx; i++) F[j * (nx + 1) + i] = fn(xs + i * dx, ys + j * dy);
		levels.forEach(function (level) {
			var seg = [];
			function lerp(a, b, fa, fb) { var t = (level - fa) / (fb - fa); return a + t * (b - a); }
			for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) {
				var f00 = F[j * (nx + 1) + i], f10 = F[j * (nx + 1) + i + 1], f01 = F[(j + 1) * (nx + 1) + i], f11 = F[(j + 1) * (nx + 1) + i + 1];
				var idx = (f00 > level ? 1 : 0) | (f10 > level ? 2 : 0) | (f11 > level ? 4 : 0) | (f01 > level ? 8 : 0); if (idx === 0 || idx === 15) continue;
				var x0 = xs + i * dx, x1 = x0 + dx, y0 = ys + j * dy, y1 = y0 + dy, e = [];
				var pb = [lerp(x0, x1, f00, f10), y0], pr = [x1, lerp(y0, y1, f10, f11)], pt = [lerp(x0, x1, f01, f11), y1], pl = [x0, lerp(y0, y1, f00, f01)];
				switch (idx) {
					case 1: case 14: e = [pl, pb]; break; case 2: case 13: e = [pb, pr]; break; case 3: case 12: e = [pl, pr]; break; case 4: case 11: e = [pr, pt]; break;
					case 6: case 9: e = [pb, pt]; break; case 7: case 8: e = [pl, pt]; break;
					case 5: e = [pl, pt, pb, pr]; break; case 10: e = [pl, pb, pt, pr]; break;
				}
				for (var k = 0; k < e.length; k += 2) seg.push(e[k][0], e[k][1], e[k + 1][0], e[k + 1][1]);
			}
			out.push(seg);
		});
		return out;
	}
	function contour(fn, box, nx, ny, level) { return contours(fn, box, nx, ny, [level])[0]; }
	/* flux through a sphere (3d) or a circle per unit length (2d), by quadrature; also the enclosed charge / eps0 */
	function gauss(ch, cx, cy, R, mode) {
		var flux = 0, i, j, nq = 0, c;
		ch.forEach(function (c) { if (Math.hypot(c.x - cx, c.y - cy) < R) nq += c.q; });
		if (mode === "2d") { var N = 720; for (i = 0; i < N; i++) { var a = (i + 0.5) * TAU / N, nxv = Math.cos(a), nyv = Math.sin(a), e = fieldAt(ch, cx + R * nxv, cy + R * nyv, "2d"); flux += (e[0] * nxv + e[1] * nyv) * R * TAU / N; } }
		else {
			var NT = 90, NP = 180; for (i = 0; i < NT; i++) { var th = (i + 0.5) * PI / NT, s = Math.sin(th), cz = Math.cos(th); for (j = 0; j < NP; j++) { var ph = (j + 0.5) * TAU / NP, nx2 = s * Math.cos(ph), ny2 = s * Math.sin(ph); /* the field is in the plane z = 0 only for charges in the plane: add the z part */
				var px = cx + R * nx2, py = cy + R * ny2, pz = R * cz, ex = 0, ey = 0, ez = 0; for (var k = 0; k < ch.length; k++) { c = ch[k]; var dx = px - c.x, dy = py - c.y, r2 = dx * dx + dy * dy + pz * pz, f = K * c.q / (r2 * Math.sqrt(r2)); ex += f * dx; ey += f * dy; ez += f * pz; }
				flux += (ex * nx2 + ey * ny2 + ez * cz) * R * R * s * (PI / NT) * (TAU / NP); } }
		}
		return { flux: flux, enclosed: nq, expected: nq / EPS0 };
	}
	/* a free charge moving in the field of fixed charges (leapfrog with an adaptive step); p = {x, y, vx, vy, q, m} */
	function stepFree(p, ch, mode, T) {
		var done = 0, guard = 0;
		while (done < T - 1e-18 && guard++ < 4000) {
			var tmin = Infinity, i, c, r, a;
			for (i = 0; i < ch.length; i++) { c = ch[i]; r = Math.max(1e-9, Math.hypot(p.x - c.x, p.y - c.y)); a = Math.abs(p.q * c.q) * (mode === "2d" ? 1 / (TAU * EPS0 * r) : K / (r * r)) / p.m; var t1 = Math.sqrt(r / Math.max(a, 1e-300)), t2 = r / Math.max(Math.hypot(p.vx, p.vy), 1e-300); tmin = Math.min(tmin, t1, t2); }
			var dt = Math.min(T - done, 0.02 * tmin); if (!(dt > 0)) dt = T - done;
			var e = fieldAt(ch, p.x, p.y, mode); p.vx += 0.5 * dt * p.q * e[0] / p.m; p.vy += 0.5 * dt * p.q * e[1] / p.m; p.x += dt * p.vx; p.y += dt * p.vy;
			e = fieldAt(ch, p.x, p.y, mode); p.vx += 0.5 * dt * p.q * e[0] / p.m; p.vy += 0.5 * dt * p.q * e[1] / p.m; done += dt;
		}
		return done;
	}

	/* ---------- wires perpendicular to the plane (current out of the page for I > 0) ---------- */
	function wireB(w, x, y) { var bx = 0, by = 0, i, dx, dy, r2, c; for (i = 0; i < w.length; i++) { dx = x - w[i].x; dy = y - w[i].y; r2 = dx * dx + dy * dy; if (r2 < 1e-18) continue; c = MU0 * w[i].I / (TAU * r2); bx += -c * dy; by += c * dx; } return [bx, by]; }
	function wireA(w, x, y) { var a = 0, i, r; for (i = 0; i < w.length; i++) { r = Math.max(1e-9, Math.hypot(x - w[i].x, y - w[i].y)); a += -MU0 * w[i].I / TAU * Math.log(r); } return a; }
	function ampere(w, cx, cy, R) { var N = 720, s = 0, i, enc = 0; for (i = 0; i < N; i++) { var a = (i + 0.5) * TAU / N, b = wireB(w, cx + R * Math.cos(a), cy + R * Math.sin(a)); s += (-b[0] * Math.sin(a) + b[1] * Math.cos(a)) * R * TAU / N; } w.forEach(function (q) { if (Math.hypot(q.x - cx, q.y - cy) < R) enc += q.I; } ); return { integral: s, enclosed: enc, expected: MU0 * enc }; }
	/* force per metre on wire i from the others, vector in the plane (attraction for parallel currents) */
	function wireForce(w, i) { var fx = 0, fy = 0, j, dx, dy, d, f; for (j = 0; j < w.length; j++) { if (j === i) continue; dx = w[j].x - w[i].x; dy = w[j].y - w[i].y; d = Math.hypot(dx, dy); if (d < 1e-12) continue; f = MU0 * w[i].I * w[j].I / (TAU * d); fx += f * dx / d; fy += f * dy / d; } return [fx, fy]; }

	/* ---------- charged particle: Boris pusher (momentum per mass u = gamma v; rel = false uses gamma = 1) ---------- */
	function borisStep(p, E, B, dt, rel) {
		var qm = p.q / p.m, hx = qm * E[0] * dt / 2, hy = qm * E[1] * dt / 2, hz = qm * (E[2] || 0) * dt / 2;
		var ux = p.ux + hx, uy = p.uy + hy, uz = p.uz + hz, g = rel ? Math.sqrt(1 + (ux * ux + uy * uy + uz * uz) / (C * C)) : 1;
		var tx = qm * B[0] * dt / (2 * g), ty = qm * B[1] * dt / (2 * g), tz = qm * B[2] * dt / (2 * g), t2 = tx * tx + ty * ty + tz * tz, sx = 2 * tx / (1 + t2), sy = 2 * ty / (1 + t2), sz = 2 * tz / (1 + t2);
		var vx = ux + (uy * tz - uz * ty), vy = uy + (uz * tx - ux * tz), vz = uz + (ux * ty - uy * tx);
		var wx = ux + (vy * sz - vz * sy), wy = uy + (vz * sx - vx * sz), wz = uz + (vx * sy - vy * sx);
		p.ux = wx + hx; p.uy = wy + hy; p.uz = wz + hz;
		g = rel ? Math.sqrt(1 + (p.ux * p.ux + p.uy * p.uy + p.uz * p.uz) / (C * C)) : 1;
		p.x += p.ux / g * dt; p.y += p.uy / g * dt; p.z += p.uz / g * dt;
	}
	function speedOf(p, rel) { var g = rel ? Math.sqrt(1 + (p.ux * p.ux + p.uy * p.uy + p.uz * p.uz) / (C * C)) : 1; return Math.sqrt(p.ux * p.ux + p.uy * p.uy + p.uz * p.uz) / g; }
	function makeParticle(q, m, x, y, speed, angle, rel) { var g = rel ? 1 / Math.sqrt(1 - Math.min(0.999999999999, speed * speed / (C * C))) : 1; return { q: q, m: m, x: x, y: y, z: 0, ux: g * speed * Math.cos(angle), uy: g * speed * Math.sin(angle), uz: 0 }; }
	function cyclotron(q, m, B, v, rel) {
		var g = rel ? 1 / Math.sqrt(1 - Math.min(0.999999999999, v * v / (C * C))) : 1, w = Math.abs(q) * B / (g * m);
		return { gamma: g, radius: g * m * v / (Math.abs(q) * Math.abs(B)), omega: w, period: TAU / w, freq: w / TAU };
	}

	/* ---------- 2D TMz Yee FDTD (units: c = 1, cell = 1, time step = S = 0.5) ---------- */
	function Yee(nx, ny) {
		this.nx = nx; this.ny = ny; var n = nx * ny; this.S = 0.5; this.t = 0; this.step = 0;
		this.ez = new Float32Array(n); this.hx = new Float32Array(n); this.hy = new Float32Array(n); this.epsr = new Float32Array(n).fill(1); this.sig = new Float32Array(n); this.pec = new Uint8Array(n);
		this.sponge = 18; this.sigAbs = new Float32Array(n); this.avg = new Float32Array(n); this.buildAbs(); this.build();
		this.sources = []; this.energyCache = 0;
	}
	Yee.prototype.buildAbs = function () {
		var nx = this.nx, ny = this.ny, L = this.sponge, i, j, d, s; this.sigAbs.fill(0);
		for (j = 0; j < ny; j++) for (i = 0; i < nx; i++) { d = Math.min(i, nx - 1 - i, j, ny - 1 - j); if (d < L) { s = Math.pow((L - d) / L, 3) * 0.9; this.sigAbs[j * nx + i] = s; } }
	};
	Yee.prototype.build = function () {
		var n = this.nx * this.ny, S = this.S, i, ca = this.ca || (this.ca = new Float32Array(n)), cb = this.cb || (this.cb = new Float32Array(n)), ha = this.ha || (this.ha = new Float32Array(n)), hb = this.hb || (this.hb = new Float32Array(n));
		for (i = 0; i < n; i++) { var e = this.epsr[i], s = this.sig[i] + this.sigAbs[i] * e, sm = this.sigAbs[i]; var k = s * S / (2 * e); ca[i] = (1 - k) / (1 + k); cb[i] = (S / e) / (1 + k); var km = sm * S / 2; ha[i] = (1 - km) / (1 + km); hb[i] = S / (1 + km); }
	};
	/* sources: {type: "point"|"line", x, y, y0, y1, amp, w (rad per time unit), phase, pulse (cycles, 0 = continuous), t0} */
	Yee.prototype.stepOnce = function () {
		var nx = this.nx, ny = this.ny, ez = this.ez, hx = this.hx, hy = this.hy, ca = this.ca, cb = this.cb, ha = this.ha, hb = this.hb, i, j, p;
		for (j = 0; j < ny - 1; j++) { p = j * nx; for (i = 0; i < nx - 1; i++, p++) { hx[p] = ha[p] * hx[p] - hb[p] * (ez[p + nx] - ez[p]); hy[p] = ha[p] * hy[p] + hb[p] * (ez[p + 1] - ez[p]); } }
		for (j = 1; j < ny; j++) { p = j * nx + 1; for (i = 1; i < nx; i++, p++) ez[p] = ca[p] * ez[p] + cb[p] * ((hy[p] - hy[p - 1]) - (hx[p] - hx[p - nx])); }
		this.t += this.S; this.step++;
		var t = this.t, k, s, a, env;
		for (k = 0; k < this.sources.length; k++) {
			s = this.sources[k]; env = 1; if (s.pulse > 0) { var tt = t - (s.t0 || 0), len = s.pulse * 2 * PI / s.w; env = tt < 0 || tt > len ? 0 : Math.pow(Math.sin(PI * tt / len), 2); } else env = Math.min(1, t * s.w / (4 * PI));
			a = s.amp * env * Math.sin(s.w * t + (s.phase || 0)); if (a === 0) continue;
			if (s.type === "line") { for (j = s.y0; j <= s.y1; j++) if (!this.pec[j * nx + s.x]) ez[j * nx + s.x] += a; } else { if (!this.pec[s.y * nx + s.x]) ez[s.y * nx + s.x] += a; }
		}
		var pecA = this.pec, n = nx * ny; for (p = 0; p < n; p++) if (pecA[p]) ez[p] = 0;
		var av = this.avg, al = 0.02; for (p = 0; p < n; p++) av[p] += al * (ez[p] * ez[p] - av[p]);
	};
	Yee.prototype.run = function (n) { for (var i = 0; i < n; i++) this.stepOnce(); };
	Yee.prototype.energy = function () { var n = this.nx * this.ny, e = 0, p; for (p = 0; p < n; p++) e += 0.5 * (this.epsr[p] * this.ez[p] * this.ez[p] + this.hx[p] * this.hx[p] + this.hy[p] * this.hy[p]); return e; };
	Yee.prototype.reset = function () { this.ez.fill(0); this.hx.fill(0); this.hy.fill(0); this.avg.fill(0); this.t = 0; this.step = 0; };
	/* wavelength (cells) -> angular frequency per time unit for the grid (c = 1) */
	function omegaFor(lambdaCells) { return TAU / lambdaCells; }


	/* ---------- permanent magnets (2D: long prisms, cross-section in the plane) ----------
	   A magnet: {x, y, a (angle of its magnetisation, S -> N, radians), L (length along it, m), W (width, m), Br (remanence, T)}; M = Br / mu0 (A/m), uniform.
	   Gilbert (magnetic charge) picture: pole sheets of density +M on the N end face and -M on the S end face; a sheet is the line-pole kernel integrated along the
	   face (exact closed forms below), so the field is smooth near the ends. psi = magnetic scalar potential (A), H = -grad psi everywhere, B = mu0 H outside and
	   mu0 (H + M) inside. Amperian picture: the same magnet is two current sheets K = M on its long sides; their vector potential A_z gives B = curl A exactly,
	   so the flux lines are the contours of A_z (equal steps of A = equal flux between lines, and the lines close through the magnet). */
	/* integral over t in [-h, h] of ln sqrt((u - t)^2 + v^2) dt */
	function logInt(u, v, h) {
		function F(s) { var r2 = s * s + v * v, t = (s === 0 ? 0 : 0.5 * s * Math.log(r2)) - s; if (v !== 0) t += v * Math.atan(s / v); return t; }
		return F(h - u) - F(-h - u);
	}
	/* integral over t in [-h, h] of (u - t, v) / ((u - t)^2 + v^2) dt = [half log ratio, angle the segment subtends] */
	function vecInt(u, v, h) { var a2 = (u + h) * (u + h) + v * v, b2 = (u - h) * (u - h) + v * v; return [0.5 * Math.log(Math.max(a2, 1e-300) / Math.max(b2, 1e-300)), Math.atan2(v, u - h) - Math.atan2(v, u + h)]; }
	function magGeo(m) { var c = Math.cos(m.a), s = Math.sin(m.a); return { mx: c, my: s, px: -s, py: c, hl: m.L / 2, hw: m.W / 2, M: m.Br / MU0 }; }
	function magInside(m, x, y) { var g = magGeo(m), dx = x - m.x, dy = y - m.y; return Math.abs(dx * g.mx + dy * g.my) < g.hl && Math.abs(dx * g.px + dy * g.py) < g.hw; }
	function magPsi(mags, x, y) {
		var psi = 0, i, m, g, sg, fx, fy, dx, dy;
		for (i = 0; i < mags.length; i++) { m = mags[i]; g = magGeo(m);
			for (sg = 1; sg >= -1; sg -= 2) { fx = m.x + sg * g.hl * g.mx; fy = m.y + sg * g.hl * g.my; dx = x - fx; dy = y - fy; psi += -sg * g.M / TAU * logInt(dx * g.px + dy * g.py, dx * g.mx + dy * g.my, g.hw); } }
		return psi;
	}
	function magH(mags, x, y) {
		var hx = 0, hy = 0, i, m, g, sg, dx, dy, G, k;
		for (i = 0; i < mags.length; i++) { m = mags[i]; g = magGeo(m);
			for (sg = 1; sg >= -1; sg -= 2) { dx = x - (m.x + sg * g.hl * g.mx); dy = y - (m.y + sg * g.hl * g.my); G = vecInt(dx * g.px + dy * g.py, dx * g.mx + dy * g.my, g.hw); k = sg * g.M / TAU; hx += k * (G[0] * g.px + G[1] * g.mx); hy += k * (G[0] * g.py + G[1] * g.my); } }
		return [hx, hy];
	}
	function magB(mags, x, y) {
		var h = magH(mags, x, y), bx = MU0 * h[0], by = MU0 * h[1], i, m;
		for (i = 0; i < mags.length; i++) { m = mags[i]; if (magInside(m, x, y)) { bx += m.Br * Math.cos(m.a); by += m.Br * Math.sin(m.a); } }
		return [bx, by];
	}
	/* vector potential A_z (T m) of the equivalent surface currents: +M out of the page on the +p side, into it on the -p side */
	function magA(mags, x, y) {
		var A = 0, i, m, g, sg, dx, dy;
		for (i = 0; i < mags.length; i++) { m = mags[i]; g = magGeo(m);
			for (sg = 1; sg >= -1; sg -= 2) { dx = x - (m.x + sg * g.hw * g.px); dy = y - (m.y + sg * g.hw * g.py); A += -sg * MU0 * g.M / TAU * logInt(dx * g.mx + dy * g.my, dx * g.px + dy * g.py, g.hl); } }
		return A;
	}
	/* B from the curl of A (central differences) -- the Amperian route, used to check the Gilbert one */
	function magBcurl(mags, x, y, h) { h = h || 1e-7; return [(magA(mags, x, y + h) - magA(mags, x, y - h)) / (2 * h), -(magA(mags, x + h, y) - magA(mags, x - h, y)) / (2 * h)]; }
	/* dipole moment per metre of depth (A m): M L W along the magnet */
	function magMoment(m) { return m.Br / MU0 * m.L * m.W; }
	/* follow a vector field fn(x, y) -> [vx, vy] (unit steps, RK4) from (x0, y0) until it leaves box, comes back to its start (closed: true) or maxSteps */
	function traceField(fn, x0, y0, h, maxSteps, box, closeTol) {
		var pts = [x0, y0], x = x0, y = y0, n, len = 0;
		function d(px, py) { var f = fn(px, py), m = Math.hypot(f[0], f[1]); return m > 0 ? [f[0] / m, f[1] / m] : [0, 0]; }
		for (n = 0; n < maxSteps; n++) {
			var k1 = d(x, y); if (!k1[0] && !k1[1]) break; var k2 = d(x + 0.5 * h * k1[0], y + 0.5 * h * k1[1]), k3 = d(x + 0.5 * h * k2[0], y + 0.5 * h * k2[1]), k4 = d(x + h * k3[0], y + h * k3[1]);
			x += h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]); y += h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]); len += h; pts.push(x, y);
			if (box && (x < box[0] || x > box[2] || y < box[1] || y > box[3])) return { pts: pts, closed: false, len: len };
			if (len > 20 * h && Math.hypot(x - x0, y - y0) < (closeTol || h)) return { pts: pts, closed: true, len: len };
		}
		return { pts: pts, closed: false, len: len };
	}
	/* net outward flux of a field fn through a circle (per metre of depth) */
	function circleFlux(fn, cx, cy, R, N) { var s = 0, i; N = N || 1440; for (i = 0; i < N; i++) { var a = (i + 0.5) * TAU / N, c = Math.cos(a), sn = Math.sin(a), f = fn(cx + R * c, cy + R * sn); s += (f[0] * c + f[1] * sn) * R * TAU / N; } return s; }
	/* evenly spaced contour levels covering [lo, hi] with n steps across the larger half-range (levels at (k + 1/2) step, so a symmetric field never sits on a level);
	   spread > 1 squeezes the levels towards 0 so weak far-field regions get lines too */
	function evenLevels(lo, hi, n, spread) {
		var R = Math.max(Math.abs(lo), Math.abs(hi)), out = [], k, t, p = spread || 1; if (!(R > 0) || n < 1) return out;
		for (k = -n; k < n; k++) { t = (k + 0.5) / n; var v = R * (t < 0 ? -1 : 1) * Math.pow(Math.abs(t), p); if (v > lo && v < hi) out.push(v); }
		return out;
	}

	var api = { K: K, EPS0: EPS0, MU0: MU0, C: C, QE: QE, ME: ME, MP: MP, AMU: AMU, fieldAt: fieldAt, potentialAt: potentialAt, forceOn: forceOn, traceLine: traceLine, fieldLines: fieldLines, contour: contour, contours: contours, gauss: gauss, stepFree: stepFree,
		wireB: wireB, wireA: wireA, ampere: ampere, wireForce: wireForce, borisStep: borisStep, speedOf: speedOf, makeParticle: makeParticle, cyclotron: cyclotron, Yee: Yee, omegaFor: omegaFor,
		logInt: logInt, vecInt: vecInt, magInside: magInside, magPsi: magPsi, magH: magH, magB: magB, magA: magA, magBcurl: magBcurl, magMoment: magMoment, traceField: traceField, circleFlux: circleFlux, evenLevels: evenLevels };
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESEM = api;
})(typeof window !== "undefined" ? window : this);
