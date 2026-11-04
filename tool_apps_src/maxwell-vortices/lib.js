/* MES Maxwell's Vortices -- pure maths (no DOM). Browser global `MESVortex`; node: require('./tool_apps_src/maxwell-vortices/lib.js');
 * tests: node tool_apps_src/maxwell-vortices-tests.js
 * SI units inside (tesla, metres, amperes, seconds) unless a name says otherwise. Vectors are [x, y, z] arrays.
 * 1. Biot-Savart: the exact field of a straight segment, summed over a polyline (a wire, a loop, a wire being bent into a loop).
 *    A charge q going round a circle of radius r at speed v is, on average, a current I = q v / (2 pi r) and a magnet of moment mu = q v r / 2.
 * 2. Maxwell's 1861 "On Physical Lines of Force" model, on a square lattice: cells (vortices) spin at omega_i (the magnetic field, out of the page),
 *    small idle wheels sit between neighbouring cells and roll on both without slipping. A wheel's centre then moves along the gap at
 *    V = a (omega_i - omega_j) / 2 (an electric current where neighbours spin differently) and spins at -a (omega_i + omega_j) / (2 b).
 *    Wheels in an insulator are held by springs (elastic cells: a twist travels as a wave); in a conductor they flow with friction (resistance).
 * 3. Two point magnetic dipoles: field, force and torque, and Maxwell's stress (tension along the lines, pressure sideways) integrated round one magnet. */
(function (root) {
	"use strict";
	var MU0 = 1.25663706212e-6, E = 1.602176634e-19, ME = 9.1093837015e-31, MP = 1.67262192369e-27, HBAR = 1.054571817e-34, C = 299792458;
	var ALPHA = 7.2973525693e-3, A0 = 5.29177210903e-11, MUB = 9.2740100783e-24, MUN = 5.0507837461e-27;
	var TAU = 2 * Math.PI, K = MU0 / (4 * Math.PI);

	function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
	function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
	function scl(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
	function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
	function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
	function norm(a) { return Math.sqrt(dot(a, a)); }

	/* ---------- 1. currents and moving charges ---------- */
	function wireB(I, r) { return MU0 * I / (TAU * r); }                         /* infinite straight wire */
	function loopCentreB(I, R) { return MU0 * I / (2 * R); }
	function loopAxisB(I, R, z) { return MU0 * I * R * R / (2 * Math.pow(R * R + z * z, 1.5)); }
	function dipoleAxisB(mu, z) { return MU0 * mu / (TAU * Math.abs(z * z * z)); }   /* far field on the axis: 2 mu mu0 / (4 pi z^3) */
	/* exact field at P of a straight segment A -> B carrying I (Biot-Savart integrated): mu0 I / (4 pi d) (cos t1 - cos t2) along dl x r */
	function segB(P, A, B, I, out) {
		var lx = B[0] - A[0], ly = B[1] - A[1], lz = B[2] - A[2], L2 = lx * lx + ly * ly + lz * lz; if (!(L2 > 0)) return out;
		var ax = P[0] - A[0], ay = P[1] - A[1], az = P[2] - A[2], bx = P[0] - B[0], by = P[1] - B[1], bz = P[2] - B[2];
		var cx = ly * az - lz * ay, cy = lz * ax - lx * az, cz = lx * ay - ly * ax, c2 = cx * cx + cy * cy + cz * cz;   /* dl x (P - A) */
		var ra = Math.sqrt(ax * ax + ay * ay + az * az), rb = Math.sqrt(bx * bx + by * by + bz * bz);
		if (c2 < 1e-30 * L2 * L2 || ra < 1e-12 || rb < 1e-12) return out;   /* on the line of the wire: no field from this segment */
		var f = K * I * ((lx * ax + ly * ay + lz * az) / ra - (lx * bx + ly * by + lz * bz) / rb) / c2;
		out[0] += f * cx; out[1] += f * cy; out[2] += f * cz; return out;
	}
	/* field of a polyline pts[0..n-1] (closed: back to pts[0]) */
	function pathB(P, pts, I, closed) {
		var out = [0, 0, 0], n = pts.length;
		for (var i = 0; i < n - 1; i++) segB(P, pts[i], pts[i + 1], I, out);
		if (closed && n > 2) segB(P, pts[n - 1], pts[0], I, out);
		return out;
	}
	/* a circle of radius R in the x-z plane, centred at the origin, current going round from +x towards +z (moment along -y) */
	function circleXZ(R, n) { var p = []; for (var i = 0; i < n; i++) { var t = TAU * i / n; p.push([R * Math.cos(t), 0, R * Math.sin(t)]); } return p; }
	/* a wire of length 2 pi R being bent into a loop (s = 0 straight, s = 1 a full circle) in the x-z plane. The middle of the wire stays at (s R, 0, 0)
	   carrying current along +z; the two leads leave the ends towards -x and are joined far away (a battery), so at s = 1 they lie side by side and cancel. */
	function bendPath(R, s, n, lead) {
		s = Math.max(0, Math.min(1, s)); n = n || 96; lead = lead || 8 * R;
		var pts = [], half = Math.PI * R;
		if (s < 1e-4) { for (var i = 0; i <= n; i++) { var u = -half + 2 * half * i / n; pts.push([0, 0, u]); } }
		else { var rho = R / s, cx = s * R - rho; for (var j = 0; j <= n; j++) { var phi = (-half + 2 * half * j / n) / rho; pts.push([cx + rho * Math.cos(phi), 0, rho * Math.sin(phi)]); } }
		var A = pts[0], B = pts[pts.length - 1], xl = Math.min(A[0], B[0]) - lead;
		/* path: far battery -> lead in -> wire -> lead out -> battery */
		var path = [[xl, 0, A[2]], A.slice()].concat(pts.slice(1, -1)).concat([B.slice(), [xl, 0, B[2]]]);
		return { pts: path, closed: true, cross: [s * R, 0, 0] };
	}
	function orbitCurrent(q, v, r) { return q * v / (TAU * r); }                  /* average current of one charge going round */
	function orbitMoment(q, v, r) { return q * v * r / 2; }                       /* = I pi r^2 */
	function orbitFreq(v, r) { return v / (TAU * r); }
	function bohr() { var v = ALPHA * C; return { r: A0, v: v, f: orbitFreq(v, A0), I: orbitCurrent(E, v, A0), mu: orbitMoment(E, v, A0), L: ME * v * A0 }; }
	/* rings of charge q_k at radius r_k all turning at the same angular speed w: mu = sum q r^2 w / 2 */
	function ringsMoment(rings, w) { var m = 0; rings.forEach(function (g) { m += g.q * g.r * g.r * w / 2; }); return m; }
	/* uniformly charged solid ball spinning at w: mu = q w r^2 / 5; speed at the equator needed for a given moment */
	function ballMoment(q, r, w) { return q * w * r * r / 5; }
	function ballEquatorSpeed(mu, q, r) { return 5 * mu / (q * r); }
	/* field of a slow point charge right now (low speed Biot-Savart): mu0 q v x r_hat / (4 pi r^2) */
	function chargeB(P, Q, v, q) { var r = sub(P, Q), d = norm(r); if (d < 1e-15) return [0, 0, 0]; return scl(cross(v, r), K * q / (d * d * d)); }
	/* field of a point dipole m at the origin, seen at r */
	function dipoleB(m, r) { var d = norm(r); if (d < 1e-15) return [0, 0, 0]; var n = scl(r, 1 / d), mn = dot(m, n); return scl(sub(scl(n, 3 * mn), m), K / (d * d * d)); }

	/* follow a 2D field (f(x, y) -> [bx, by]) from a start point: RK4 on the unit direction. Stops on leaving the box, closing a loop or hitting stop(x, y). */
	function streamline(f, x0, y0, o) {
		o = o || {}; var h = o.h || 0.02, n = o.n || 1500, box = o.box || [-1e9, 1e9, -1e9, 1e9], dir = o.dir || 1, pts = [[x0, y0]], x = x0, y = y0, len = 0, closed = false;
		function d(x, y) { var b = f(x, y), m = Math.hypot(b[0], b[1]); return m > 0 && isFinite(m) ? [dir * b[0] / m, dir * b[1] / m] : null; }
		for (var i = 0; i < n; i++) {
			var k1 = d(x, y); if (!k1) break; var k2 = d(x + h * k1[0] / 2, y + h * k1[1] / 2); if (!k2) break; var k3 = d(x + h * k2[0] / 2, y + h * k2[1] / 2); if (!k3) break; var k4 = d(x + h * k3[0], y + h * k3[1]); if (!k4) break;
			x += h * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6; y += h * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6; len += h; pts.push([x, y]);
			if (x < box[0] || x > box[1] || y < box[2] || y > box[3]) break;
			if (o.stop && o.stop(x, y)) break;
			if (len > 8 * h && Math.hypot(x - x0, y - y0) < 0.6 * h) { closed = true; break; }
		}
		return { pts: pts, closed: closed };
	}

	/* ---------- 2. Maxwell's cells and idle wheels ---------- */
	/* rolling without slipping: wheel (radius b) between cell i (centre at -n from the gap) and cell j (centre at +n), both of radius a.
	   t = n turned +90 degrees. Returns the wheel centre's speed along t and its spin. */
	function wheelKin(a, b, wi, wj) { return { V: a * (wi - wj) / 2, W: -a * (wi + wj) / (2 * b) }; }
	/* speeds of the touching surfaces along t (all four must agree pairwise when rolling) */
	function contactSpeeds(a, b, wi, wj) { var k = wheelKin(a, b, wi, wj); return { cellI: wi * a, wheelI: k.V - k.W * b, cellJ: -wj * a, wheelJ: k.V + k.W * b }; }
	/* square lattice, spacing 1. Cells (x, y), index y * nx + x. Edges: "h" between (x, y) and (x + 1, y) (n = +x, t = +y),
	   "v" between (x, y) and (x, y + 1) (n = +y, t = -x). o: {nx, ny, a (cell radius), k (spring), I (cell inertia), g (conductor friction)} */
	function lattice(o) {
		o = o || {}; var nx = o.nx || 24, ny = o.ny || 16, N = nx * ny, a = o.a || 0.38;
		var ei = [], ej = [], ex = [], ey = [], tx = [], ty = [], kind = [];
		for (var y = 0; y < ny; y++) for (var x = 0; x < nx; x++) {
			if (x < nx - 1) { ei.push(y * nx + x); ej.push(y * nx + x + 1); ex.push(x + 0.5); ey.push(y); tx.push(0); ty.push(1); kind.push(0); }
			if (y < ny - 1) { ei.push(y * nx + x); ej.push((y + 1) * nx + x); ex.push(x); ey.push(y + 0.5); tx.push(-1); ty.push(0); kind.push(1); }
		}
		var M = ei.length;
		return { nx: nx, ny: ny, N: N, M: M, a: a, b: 0.5 - a, k: o.k == null ? 144 : o.k, I: o.I || 1, g: o.g == null ? 6 : o.g, t: 0,
			w: new Float64Array(N), th: new Float64Array(N), damp: new Float64Array(N),
			ei: Int32Array.from(ei), ej: Int32Array.from(ej), ex: Float64Array.from(ex), ey: Float64Array.from(ey), tx: Int8Array.from(tx), ty: Int8Array.from(ty), kind: Int8Array.from(kind),
			u: new Float64Array(M), ph: new Float64Array(M), cond: new Uint8Array(M), src: new Float64Array(M), v: new Float64Array(M), tq: new Float64Array(N) };
	}
	function edgeAt(L, x0, y0, x1, y1) { /* the edge between two neighbouring cells, or -1 */
		if (x1 < x0 || y1 < y0) { var t = x0; x0 = x1; x1 = t; t = y0; y0 = y1; y1 = t; }
		var i = y0 * L.nx + x0, j = y1 * L.nx + x1; for (var e = 0; e < L.M; e++) if (L.ei[e] === i && L.ej[e] === j) return e; return -1;
	}
	/* one time step (symplectic Euler). Edge force on the wheel along t: spring -k u (insulator) or src - g v (conductor).
	   The force's virtual work f du = f a/2 (d theta_i - d theta_j) gives the torques on the two cells. */
	function step(L, dt) {
		var a = L.a, hA = a / 2, tq = L.tq, w = L.w, i, e; tq.fill(0);
		for (e = 0; e < L.M; e++) {
			var vi = hA * (w[L.ei[e]] - w[L.ej[e]]), f = L.cond[e] ? L.src[e] - L.g * vi : -L.k * L.u[e];
			tq[L.ei[e]] += f * hA; tq[L.ej[e]] -= f * hA;
		}
		for (i = 0; i < L.N; i++) { w[i] += dt * (tq[i] / L.I - L.damp[i] * w[i]); L.th[i] += dt * w[i]; }
		var b = L.b;
		for (e = 0; e < L.M; e++) { var wi = w[L.ei[e]], wj = w[L.ej[e]], V = hA * (wi - wj); L.v[e] = V; L.u[e] += dt * V; L.ph[e] += dt * (-a * (wi + wj) / (2 * b)); }
		L.t += dt;
	}
	function energy(L) { var s = 0, i; for (i = 0; i < L.N; i++) s += 0.5 * L.I * L.w[i] * L.w[i]; for (i = 0; i < L.M; i++) if (!L.cond[i]) s += 0.5 * L.k * L.u[i] * L.u[i]; return s; }
	function angMom(L) { var s = 0; for (var i = 0; i < L.N; i++) s += L.I * L.w[i]; return s; }
	/* long-wavelength wave speed (cells per second): theta'' = (k a^2 / 4 I) * discrete Laplacian */
	function waveSpeed(L) { return L.a * Math.sqrt(L.k / (4 * L.I)); }
	function stableDt(L) { return 0.5 / (waveSpeed(L) * Math.sqrt(8) + L.g * L.a * L.a / L.I + 1e-9); }
	/* mean wheel speed along a set of edges, each counted along its own direction sign (to read a current) */
	function current(L, edges, signs) { if (!edges.length) return 0; var s = 0; for (var k = 0; k < edges.length; k++) s += L.v[edges[k]] * (signs ? signs[k] : 1); return s / edges.length; }

	/* ---------- 3. two magnets (point dipoles) ---------- */
	/* force on dipole 2 from dipole 1, r = r2 - r1 */
	function dipoleForce(m1, m2, r) {
		var d = norm(r), n = scl(r, 1 / d), a = dot(m1, n), b = dot(m2, n), k = 3 * K / (d * d * d * d);
		return scl(add(add(scl(m2, a), scl(m1, b)), scl(n, dot(m1, m2) - 5 * a * b)), k);
	}
	function dipoleTorque(m1, m2, r) { return cross(m2, dipoleB(m1, r)); }          /* torque on 2 about its own centre */
	function dipoleEnergy(m1, m2, r) { return -dot(m2, dipoleB(m1, r)); }
	/* force on everything inside a sphere (centre c, radius R) from Maxwell's stress T_ij = (B_i B_j - delta_ij B^2 / 2) / mu0, field B(P) */
	function stressForce(Bf, c, R, nt, np) {
		nt = nt || 48; np = np || 96; var F = [0, 0, 0];
		for (var i = 0; i < nt; i++) {
			var th = Math.PI * (i + 0.5) / nt, st = Math.sin(th), ct = Math.cos(th), dA = R * R * st * (Math.PI / nt) * (TAU / np);
			for (var j = 0; j < np; j++) {
				var ph = TAU * (j + 0.5) / np, n = [st * Math.cos(ph), st * Math.sin(ph), ct], B = Bf(add(c, scl(n, R))), Bn = dot(B, n), B2 = dot(B, B);
				F[0] += (B[0] * Bn - 0.5 * B2 * n[0]) / MU0 * dA; F[1] += (B[1] * Bn - 0.5 * B2 * n[1]) / MU0 * dA; F[2] += (B[2] * Bn - 0.5 * B2 * n[2]) / MU0 * dA;
			}
		}
		return F;
	}
	/* moment of a uniformly magnetized bar: m = Br V / mu0 */
	function barMoment(Br, V) { return Br * V / MU0; }
	var PAIRS = [
		{ id: "headtail", name: "N to S in a line (attract)", a: [0, 0], b: [8, 0], ta: 0, tb: 0 },
		{ id: "headhead", name: "N to N (repel)", a: [0, 0], b: [8, 0], ta: 0, tb: 180 },
		{ id: "sidepar", name: "Side by side, same way (repel)", a: [0, 0], b: [0, 6], ta: 0, tb: 0 },
		{ id: "sideanti", name: "Side by side, opposite (attract)", a: [0, 0], b: [0, 6], ta: 0, tb: 180 },
		{ id: "tee", name: "T shape (turns)", a: [0, 0], b: [8, 0], ta: 0, tb: 90 }
	];

	var api = {
		MU0: MU0, E: E, ME: ME, MP: MP, HBAR: HBAR, C: C, ALPHA: ALPHA, A0: A0, MUB: MUB, MUN: MUN,
		add: add, sub: sub, scl: scl, dot: dot, cross: cross, norm: norm,
		wireB: wireB, loopCentreB: loopCentreB, loopAxisB: loopAxisB, dipoleAxisB: dipoleAxisB, segB: segB, pathB: pathB, circleXZ: circleXZ, bendPath: bendPath,
		orbitCurrent: orbitCurrent, orbitMoment: orbitMoment, orbitFreq: orbitFreq, bohr: bohr, ringsMoment: ringsMoment, ballMoment: ballMoment, ballEquatorSpeed: ballEquatorSpeed,
		chargeB: chargeB, dipoleB: dipoleB, streamline: streamline,
		wheelKin: wheelKin, contactSpeeds: contactSpeeds, lattice: lattice, edgeAt: edgeAt, step: step, energy: energy, angMom: angMom, waveSpeed: waveSpeed, stableDt: stableDt, current: current,
		dipoleForce: dipoleForce, dipoleTorque: dipoleTorque, dipoleEnergy: dipoleEnergy, stressForce: stressForce, barMoment: barMoment, PAIRS: PAIRS
	};
	if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MESVortex = api;
})(this);
